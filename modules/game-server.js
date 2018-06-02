
const uuidv4 = require('uuid/v4');
var Jwt = require("jsonwebtoken");
var Mongoose = require("mongoose");

//Custom Modules
var localServer = require('./local-server');

//Models
var Car = require("../models/Car");
var Admin = require("../models/Admin");
var Driver = require("../models/Driver");
var Room = require("../models/Room");
var Track = require("../models/Track");


const ActiveRooms = {}; //Put rooms by room ids
const ActiveDrivers = {}; //{ driver, socket, room } by driver.uuid
const ActiveCars = {};
const Tracks = {};
const DriverTimeouts = {}; //Put timeouts by driver id. When a driver disconnect while he is in a room in queue, create a timeout and keep it here. If he connects back before timeout, stop this timeout.
const ActiveAdmins = {};

const Snapshot = {}; //Keep Tracks, rooms and cars in it.
const PrivateRoomSnapshots = {}; //These have detailed info about the room and will be send to a driver who is in the room when reconnect.
/*
PrivateRoomSnapshots = {
   "room1uuid": {
      name: "roomname1",
      admin_id: "",
      drivers: {
         "driveruuid1": {
            username: driver.username,
            xp: driver.xp,
            status: driver.status,
            bronze_medal: driver.bronze_medal,
            silver_medal: driver.silver_medal,
            gold_medal: driver.gold_medal
         }
      },
      chat: [{username: "", text: ""}]
   }
};
*/
/*
Snapshot: 
{
   uuid: "trackid1",
   name: "",
   chat: [{ username, text }]
   room_in_race: {
      uuid: "",
      track_id,
      drivers: {
         "driveruuid1": {
            username: driver.username
         }
      },
      ranking: ["driver_uuid1", "driver_uuid2", "driver_uuid3", "driver_uuid4"]
   }
   rooms: {
      Room1uuid: {
            uuid: "",
            name: "",
            status: 0,
            driver_count: 3,
            is_locked: 0,
            }
      }
   ]
}
*/

const COIN_PER_RACE = 1;
const MAX_ROOM_CAPACITY = 4;
process.env.SECRET_KEY = "*/THISISSECRET/*";

const Enum_Driver_Status = {
      ONLINE: 0,
      OFFLINE: 1,
      CONNECTED_TO_LOCAL_SERVER: 2,
};

const Enum_Driver_Room_Status = {
      OFFLINE: 0,
      NOT_READY: 1,
      READY: 2
};

const Enum_Room_Status = {
      CREATING: 0,
      IN_QUEUE: 1,
      IN_QUEUE_READY: 2,
      IN_PRE_RACE: 3,
      IN_RACE: 4,
      IN_RACE_RESULT: 5,
      CLOSED: 6 //if the room is CLOSED and Room.race is null, then room was closed while it was in the queue.
};

//Callback fail reasons
const Enum_Callback_Reason = {
      ALREADY_LOGGED_IN: 0,
      NOT_LOGGED_IN: 1,
      TOKEN_EXPIRED: 2,
      WRONG_CREDENTIALS: 3,
      MISSING_INFO: 4,
      DB_ERROR: 5,
      NOT_ENOUGH_COIN: 6,
      ROOM_IS_FULL: 7,
      SAME_USERNAME_OR_EMAIL_EXIST: 8,
      NO_TRACK_WITH_GIVEN_ID: 9,
      NO_ROOM_WITH_GIVEN_ID: 10,
      DRIVER_IS_NOT_IN_A_ROOM: 11,
      STILL_IN_RACE: 12 //If admin tries to take next room in while there is a race running on a track, we will send this reason.
};

//DB user pass: tracerwebserver**
//Connection URL
const url = 'mongodb://tracer_web_server:tracerwebserver**@ds123796.mlab.com:23796/tracerdb';
//const url = 'mongodb://localhost:27017/tracerDB';
var db = null;


var io = null;
var ioadmin = null;
module.exports.start = function (httpServer) {
      Mongoose.connect(url);
      db = Mongoose.connection;

      db.once("open", function () {
            console.log("Mongoose connected to DB server");
            //Use this to clear collection for test purposes.
            // Room.remove({}, function(){
            //    console.log("All rooms removed!");
            // });

            //Take all necessary info to variables(ActiveRooms, ActiveDriver, Snapshot etc) then start socketio server.
            Track.find({}, function (err, tracks) {
                  if (err) {
                        console.log("Error while getting Tracks from DB.-> " + err);
                        return;
                  }
                  for (var t = 0; t < tracks.length; t++) {
                        Tracks[tracks[t].uuid] = tracks[t];
                        Snapshot[tracks[t].uuid] = {
                              name: tracks[t].name,
                              rooms: {},
                              chat: []
                        };
                        Room.find({
                              track_id: tracks[t].uuid,
                              $and: [
                                    { status: { $ne: Enum_Room_Status.CLOSED } }, //$ne: Not Equal
                                    { status: { $ne: Enum_Room_Status.IN_RACE_RESULT } }
                              ]
                        }, function (err, rooms) {
                              if (err) {
                                    console.log("Error while getting Rooms from DB.-> " + err);
                                    return;
                              }
                              for (var r = 0; r < rooms.length; r++) {
                                    ActiveRooms[rooms[r].uuid] = rooms[r];
                                    PrivateRoomSnapshots[rooms[r].uuid] = RoomPrivateViewModel(rooms[r]);
                                    for (var uuid in rooms[r].drivers) {
                                          ActiveDrivers[uuid] = { room: rooms[r] };
                                          //Set Driver status offline.
                                          rooms[r].drivers[uuid].status = Enum_Driver_Room_Status.OFFLINE;
                                          Driver.findOne({ uuid }, function (err, driver) {
                                                if (err) {
                                                      console.log("Error retriving driver from DB. -> " + err);
                                                      return;
                                                }
                                                if (driver) {
                                                      ActiveDrivers[driver.uuid].driver = driver;
                                                      PrivateRoomSnapshots[ActiveDrivers[driver.uuid].room.uuid].drivers[driver.uuid] = DriverPublicViewModel(driver);
                                                }
                                          });
                                    }
                                    var snapshotRoom = RoomPublicViewModel(rooms[r]);
                                    Snapshot[rooms[r].track_id].rooms[rooms[r].uuid] = snapshotRoom;
                              }
                              
                        });
                  }

            });


            setTimeout(() => {
                  //Wait for all info to load from DB then start the socket server.
                  main(httpServer);
            }, 3000);
      });

      db.on("error", function (err) {
            throw err;
      });
};

function main(httpServer) {
      localServer.start(localServerCallbacks);

      setTimeout(() => {
            //Wait for drivers in the rooms to get online. If they are not online after a while, remove them from both room and ActiveDrivers.
            for (var driverUuid in ActiveDrivers) {
                  if (!ActiveDrivers[driverUuid].socket) {
                        RemoveDriverFromRoom(driverUuid);
                        delete ActiveDrivers[driverUuid];
                  }
            }
      }, 10000);

      io = require('socket.io').listen(httpServer);
      io.sockets.on('connection', socket => {
            //Send Snapshot
            socket.emit("snapshot", Snapshot);

            socket.on('disconnect', function () {
                  console.log('Client got disconnected!');
                  //If driver was in a room 1) if room was in queue: start a timeout. When time out, remove driver form the room.
                  //2) If room was locked and started race, wait driver to connect again. So do not do anything here. Just set driver_room_status.
                  if (socket.driver)
                        onDisconnect(socket.driver);
            });

            socket.on('global-chat', data => {
                  if (socket.driver && Tracks[data.track_id])
                        UpdateManager.emitUpdate[UpdateManager.UpdateTypes.GLOBAL_CHAT](data.track_id, socket.driver.username, data.text);
            });

            socket.on('room-chat', data => {
                  //Emit to room if roomId exist
                  if (socket.driver && ActiveDrivers[socket.driver.uuid].room){
                        var room = ActiveDrivers[socket.driver.uuid].room;
                        room.chat.push({ username: socket.driver.username, text: data.text });
                        ActiveDrivers[socket.driver.uuid].room.save();
                        UpdateManager.emitUpdate[UpdateManager.UpdateTypes.ROOM_CHAT](ActiveDrivers[socket.driver.uuid].room.uuid, socket.driver.username, data.text);
                  }
            });

            socket.on('answer', (data, callback) => {
                  if (!socket.driver || !data.sdp)
                        return;
                  localServer.sendAnswerSdp(socket.driver.uuid, data.sdp, data.isleft);
            });

            socket.on('candidate', (data, callback) => {
                  if (!socket.driver || !data.candidate)
                        return;
                  localServer.sendCandidate(socket.driver.uuid, data.candidate, data.isleft);
            });

            socket.on('ready', (callback) => {
                  if (!socket.driver || !ActiveDrivers[socket.driver.uuid].room)
                        return;
                  var room = ActiveDrivers[socket.driver.uuid].room;
                  room.drivers[socket.driver.uuid].status = Enum_Driver_Room_Status.READY;
                  //Check if driver count is more than 1 and all drivers are ready. Then set room status to Ready.
                  var ready = 0;
                  for(var d in room.drivers){
                        if(room.drivers[d].status == Enum_Driver_Room_Status.OFFLINE || room.drivers[d].status == Enum_Driver_Room_Status.NOT_READY){
                              ready = 0;
                              break;
                        }else if(room.drivers[d].status == Enum_Driver_Room_Status.READY)
                              ready++;
                  }
                  if(ready > 1)
                        room.status = Enum_Room_Status.IN_QUEUE_READY;
                  UpdateManager.emitUpdate[UpdateManager.UpdateTypes.DRIVER_IS_READY](ActiveDrivers[socket.driver.uuid].room.track_id, ActiveDrivers[socket.driver.uuid].room.uuid, socket.driver.uuid);
                  callback({ success: true });
            });

            socket.on('notready', (callback) => {
                  if (!socket.driver || !ActiveDrivers[socket.driver.uuid].room)
                        return;
                  ActiveDrivers[socket.driver.uuid].room.drivers[socket.driver.uuid].status = Enum_Driver_Room_Status.NOT_READY;
                  UpdateManager.emitUpdate[UpdateManager.UpdateTypes.DRIVER_IS_NOT_READY](ActiveDrivers[socket.driver.uuid].room.track_id, ActiveDrivers[socket.driver.uuid].room.uuid, socket.driver.uuid);
                  callback({ success: true });
            });

            socket.on('register', (data, callback) => {
                  //check if all info given
                  if (!(data.username && data.email && data.password)) {
                        callback({ success: false, reason: Enum_Callback_Reason.MISSING_INFO }); //"One of the info is missing!"
                        return;
                  }

                  //Check if there is another user with this username or email address. If so, return false.
                  Driver.findOne({
                        $or: [
                              { username: data.username },
                              { email: data.email }]
                  }, function (err, existingDriver) {
                        if (existingDriver) {
                              callback({ success: false, reason: Enum_Callback_Reason.SAME_USERNAME_OR_EMAIL_EXIST, error: err });
                              return;
                        }

                        //create new driver in DB
                        var driver = new Driver({
                              _id: new Mongoose.Types.ObjectId(),
                              uuid: uuidv4(),
                              username: data.username,
                              email: data.email,
                              password: data.password,
                              coin: 10, //TODO: Get this value from DB.
                              xp: 0,
                              bronze_medal: 0,
                              silver_medal: 0,
                              gold_medal: 0,
                              registeration_date: Date.now(),
                              last_login_date: Date.now(),
                              status: Enum_Driver_Status.ONLINE
                        });
                        driver.save(function (err) {
                              if (err) {
                                    callback({ success: false, reason: Enum_Callback_Reason.DB_ERROR, error: err });
                                    return;
                              } else {
                                    //keep driver info on the socket
                                    socket.driver = driver;
                                    //keep the socket by its driver id to access it when a message comes from the local server
                                    ActiveDrivers[driver.uuid] = { driver: driver, socket: socket };
                                    //send driver info back
                                    _socket.emit('authenticate', { driver: DriverPrivateViewModel(driver), token: createNewToken(DriverPrivateViewModel(driver), 60 * 60 * 24) });
                                    callback({ success: true });
                              }
                        });

                  });
            });

            socket.on('authenticate', (data, callback) => {
                  //check if all info given (username&&password or token)
                  if (data.token) {
                        Jwt.verify(data.token, process.env.SECRET_KEY, function (err, driver) {
                              if (err || !driver) {
                                    callback({ success: false, reason: Enum_Callback_Reason.TOKEN_EXPIRED, error: err }); //"Jwt error"
                                    return;
                              }
                              //Check if this driver id has a info in ActiveDrivers. If so, dont allow him to login from here.
                              if (ActiveDrivers[driver.uuid] && ActiveDrivers[driver.uuid].socket) {
                                    if(ActiveDrivers[driver.uuid].socket.connected){
                                          callback({ success: false, reason: Enum_Callback_Reason.ALREADY_LOGGED_IN }); //"Already logged in from another tab."
                                          return;
                                    }else{
                                          delete ActiveDrivers[driver.uuid].socket;
                                    }
                              }
                              Driver.findOne({ uuid: driver.uuid }, function (err, d) {
                                    if (err) {
                                          callback({ success: false, reason: Enum_Callback_Reason.DB_ERROR, error: err });
                                          return;
                                    }
                                    if (!d) {
                                          callback({ success: false, reason: Enum_Callback_Reason.WRONG_CREDENTIALS }); //"Couldnt find in DB."
                                          return;
                                    }
                                    //send driver info back
                                    callback({ success: true });
                                    logDriverIn(d, socket);
                              });

                        });
                  } else if (data.username && data.password) {
                        //Check username and password from DB                
                        if (!db) {
                              callback({ success: false, reason: Enum_Callback_Reason.DB_ERROR }); //"DB is NULL"
                              return;
                        }
                        Driver.findOne({ username: data.username, password: data.password }, function (err, driver) {
                              if (err) {
                                    callback({ success: false, reason: Enum_Callback_Reason.DB_ERROR, error: err });
                                    return;
                              }
                              if (!driver) {
                                    callback({ success: false, reason: Enum_Callback_Reason.WRONG_CREDENTIALS }); //"Couldnt find in DB."
                                    return;
                              }
                              //Check if this driver id has a socket in DriverSockets. If so, dont allow him to login from here.
                              if (ActiveDrivers[driver.uuid] && ActiveDrivers[driver.uuid].socket) {
                                    callback({ success: false, reason: Enum_Callback_Reason.ALREADY_LOGGED_IN }); //"Already logged in from another tab."
                                    return;
                              }
                              //send driver info back
                              callback({ success: true });
                              logDriverIn(driver, socket);
                              return;

                        });
                  } else {
                        callback({ success: false, reason: Enum_Callback_Reason.MISSING_INFO });
                        return;
                  }
            });

            socket.on('logout', (data, callback) => {
                  //We keep socket connection and delete driver in active drivers.
                  if (!socket.driver) {
                        return;
                  }

                  //If driver is in a room, take him out.
                  RemoveDriverFromRoom(socket.driver.uuid);
                  delete ActiveDrivers[socket.driver.uuid];
                  delete socket.driver;
                  callback({ success: true });
            });

            socket.on('room-snapshot', (data, callback) => {
                  //We will update this driver with his room information.
                  if (!socket.driver) {
                        callback({ success: false, reason: Enum_Callback_Reason.NOT_LOGGED_IN }); //"Socket.driver is NULL."
                        return;
                  }
                  if(!ActiveDrivers[socket.driver.uuid].room || !ActiveRooms[ActiveDrivers[socket.driver.uuid].room.uuid]){
                        callback({ success: false, reason: Enum_Callback_Reason.DRIVER_IS_NOT_IN_A_ROOM });
                        return;
                  }

                  callback({ success: true, room_private_view: RoomPrivateViewModel(ActiveDrivers[socket.driver.uuid].room) });
            });

            socket.on('leave-room', (data, callback) => {
                  if (!socket.driver || !ActiveDrivers[socket.driver.uuid].room) {
                        return;
                  }

                  socket.leave(ActiveDrivers[socket.driver.uuid].room.uuid);
                  RemoveDriverFromRoom(socket.driver.uuid);
                  callback({ success: true });
            });

            socket.on('create-room', (data, callback) => {
                  //Check if he is logged in
                  if (!socket.driver) {
                        callback({ success: false, reason: Enum_Callback_Reason.NOT_LOGGED_IN }); //"Socket.driver is NULL."
                        return;
                  }
                  //Check if track_id and room name exist
                  if (!data.track_id || !data.name) {
                        callback({ success: false, reason: Enum_Callback_Reason.MISSING_INFO }); //"track_id or room name is missing."
                        return;
                  }

                  //Check if a track with track_id exist
                  if (!Tracks[data.track_id]) {
                        callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
                        return;
                  }
                  var driver = socket.driver;

                  //Check if driver has enough money to join the race.
                  if (driver.coin >= COIN_PER_RACE) {
                        //Check If driver is in another room already. if so, first get him out of that room by changing the driver_room_status.
                        if (ActiveDrivers[driver.uuid].room) {
                              var room = ActiveDrivers[driver.uuid].room;
                              //remove driver from the room
                              RemoveDriverFromRoom(driver.uuid);
                              //Remove driver from socket.io room too
                              socket.leave(room.uuid);
                        }

                        //Create a room and driver with status CONNECTING
                        var newRoom = new Room({
                              _id: new Mongoose.Types.ObjectId(),
                              uuid: uuidv4(),
                              status: Enum_Room_Status.IN_QUEUE,
                              create_date: Date.now(),
                              admin_id: driver.uuid,
                              race: null,
                              name: data.name,
                              password: data.password,
                              track_id: data.track_id,
                              drivers: {},
                              chat: []
                        });
                        newRoom.drivers[driver.uuid] = { status: Enum_Driver_Room_Status.NOT_READY, controlled_car_id: null, streamed_car_id: null };
                        newRoom.save(function (err, room) {
                              if (err || !room) {
                                    console.log("Couldnt save new Room to DB! -> ", err);
                                    callback({ success: false, reason: Enum_Callback_Reason.DB_ERROR, error: err });
                                    return;
                              }
                              ActiveRooms[room.uuid] = room;
                              ActiveDrivers[driver.uuid].room = room;
                              socket.join(room.uuid);
                              callback({ success: true, reason: "Room is created! Uuid id: " + room.uuid, room_private_view: RoomPrivateViewModel(room) });

                              //let people know that a new room was created.
                              UpdateManager.emitUpdate[UpdateManager.UpdateTypes.ROOM_CREATED](RoomPublicViewModel(room), driver.uuid);
                        });
                  } else {
                        callback({ success: false, reason: Enum_Callback_Reason.NOT_ENOUGH_COIN });
                        return;
                  }
            });

            socket.on('join-room', (data, callback) => {
                  //Check if he is logged in
                  if (!socket.driver) {
                        callback({ success: false, reason: Enum_Callback_Reason.NOT_LOGGED_IN });
                        return;
                  }
                  var driver = socket.driver;

                  //Check if room_id exist
                  if (!data.room_id) {
                        callback({ success: false, reason: Enum_Callback_Reason.MISSING_INFO });
                        return;
                  }

                  //Check if room exist.
                  if (!ActiveRooms[data.room_id]) {
                        callback({ success: false, reason: Enum_Callback_Reason.NO_ROOM_WITH_GIVEN_ID });
                        return;
                  }

                  //Check if the room is full already.
                  if (Object.keys(ActiveRooms[data.room_id].drivers).length >= MAX_ROOM_CAPACITY) {
                        callback({ success: false, reason: Enum_Callback_Reason.ROOM_IS_FULL });
                        return;
                  }

                  //Check if driver has enough money to join the race.
                  if (driver.coin >= COIN_PER_RACE) {
                        //Check If driver is in another room already. if so, first get him out of that room.
                        if (ActiveDrivers[driver.uuid].room) {
                              var room = ActiveDrivers[driver.uuid].room;
                              //remove driver from the room
                              RemoveDriverFromRoom(driver.uuid);
                              //Remove driver from socket.io room too
                              socket.leave(room.uuid);
                              delete ActiveDrivers[driver.uuid].room;
                        }

                        //Find the room and add the driver
                        if (ActiveRooms[data.room_id]) {
                              var room = ActiveRooms[data.room_id];
                              room.drivers[driver.uuid] = { status: Enum_Driver_Room_Status.NOT_READY, controlled_car_id: null, streamed_car_id: null };
                              room.markModified("drivers");
                              room.save(function (err, updatedRoom) {
                                    if (updatedRoom) {
                                          ActiveRooms[updatedRoom.uuid] = updatedRoom;
                                          ActiveDrivers[driver.uuid].room = updatedRoom;
                                          callback({ success: true, room_private_view: RoomPrivateViewModel(updatedRoom), reason: "Joined the room!" });
                                          
                                          //let people know that new driver joined the room.
                                          UpdateManager.emitUpdate[UpdateManager.UpdateTypes.DRIVER_JOINED_ROOM](updatedRoom.track_id, updatedRoom.uuid, DriverPublicViewModel(driver));
                                          //We join at the end to prevent DRIVER_JOINED_ROOM message to emit to new driver.
                                          socket.join(updatedRoom.uuid);
                                    } else {
                                          console.log("Could NOT update the room in DB and add the driver.");
                                          callback({ success: false, reason: Enum_Callback_Reason.DB_ERROR });
                                    }
                              });
                        }
                  } else {
                        callback({ success: false, reason: Enum_Callback_Reason.NOT_ENOUGH_COIN });
                  }
            });

      });

      function onDisconnect(driver) {
            driver.status = Enum_Driver_Status.OFFLINE;
            driver.save();
            if (ActiveDrivers[driver.uuid].room) {
                  var room = ActiveDrivers[driver.uuid].room;
                  room.drivers[driver.uuid].status = Enum_Driver_Room_Status.OFFLINE;
                  room.markModified("drivers");
                  room.save();
                  //Remove driver from socket.io room too
                  ActiveDrivers[driver.uuid].socket.leave(room.uuid);
                  //let others in the room know this driver got offline
                  UpdateManager.emitUpdate[UpdateManager.UpdateTypes.DRIVER_GOT_OFFLINE](room.track_id, room.uuid, driver.uuid);
                  if (room.status == Enum_Room_Status.CREATING || room.status == Enum_Room_Status.IN_QUEUE) {
                        var timeoutId = setTimeout(function () {
                              console.log("Waited enough for the Driver. Removing from room and ActiveDrivers.");
                              RemoveDriverFromRoom(driver.uuid);
                              delete ActiveDrivers[driver.uuid];
                              delete DriverTimeouts[driver.uuid];
                        }, 20000);
                        DriverTimeouts[driver.uuid] = timeoutId;
                  }
                  //Set socket null in case we are waiting for driver to come back. When he comes back check if driver's socket is null in ActiveDrivers.
                  delete ActiveDrivers[driver.uuid].socket;
            } else {
                  console.log("Removing driver from ActiveDrivers.");
                  delete ActiveDrivers[driver.uuid];
                  return;
            }
      }

      function logDriverIn(driver, _socket) {
            //Stop timer if exist
            if (DriverTimeouts[driver.uuid]) {
                  clearTimeout(DriverTimeouts[driver.uuid]);
                  delete DriverTimeouts[driver.uuid];
            }

            //keep driver info on the socket
            _socket.driver = driver;
            //keep the socket by its driver id to access it when a message comes from the local server
            if (!ActiveDrivers[driver.uuid])
                  ActiveDrivers[driver.uuid] = {};
            ActiveDrivers[driver.uuid].driver = driver;
            ActiveDrivers[driver.uuid].socket = _socket;
            driver.last_login = Date.now();
            driver.save();
            //db.collection("drivers").updateOne({ _id: driver.uuid },{ $set:{ last_login: driver.last_login, status: driver.status }});
            //Create new token with expiration date
            _socket.emit('authenticate', { driver: DriverPrivateViewModel(driver), token: createNewToken(DriverPrivateViewModel(driver), 60 * 60 * 24) });

            //Check if driver was in a room and disconnected. If so, connect him to the room.
            //if room is not in ActiveRooms, delete driver's room.
            if (ActiveDrivers[driver.uuid].room && ActiveRooms[ActiveDrivers[driver.uuid].room.uuid]) {
                  //Our beloved driver is online again. Emit an Update to the room.
                  ActiveDrivers[driver.uuid].room.drivers[driver.uuid].status = Enum_Driver_Room_Status.NOT_READY;
                  UpdateManager.emitUpdate[UpdateManager.UpdateTypes.DRIVER_GOT_ONLINE](ActiveDrivers[driver.uuid].room.track_id, ActiveDrivers[driver.uuid].room.uuid, driver.uuid);
                  _socket.emit("room-snapshot", { room_private_view: PrivateRoomSnapshots[ActiveDrivers[driver.uuid].room.uuid]});
                  _socket.join(ActiveDrivers[driver.uuid].room.uuid);
            } else {
                  delete ActiveDrivers[driver.uuid].room;
            }
      }

      //This is used when TakeNextRoomIn is called.
      function GetNextRoomByTrackId(track_id) {
            var theroom;
            for (var room in ActiveRooms) {
                  if (room.status == Enum_Room_Status.IN_QUEUE_READY && room.track_id == track_id && room.race == null && (!theroom || room.create_date < theroom.create_date))
                        theroom = room;
            }
            return theroom;
      }


      //Update:
      // - Room Created
      // - Room Closed
      // - Room Entered Race
      // - Room Finished Race
      // - Driver Joined Room
      // - Driver Left Room

      var UpdateManager = new function () {
            var _that = this;
            this.UpdateTypes = {
                  ROOM_CREATED: 0,
                  ROOM_CLOSED: 1,
                  ROOM_ENTERED_RACE: 2,
                  ROOM_FINISHED_RACE: 3,
                  DRIVER_JOINED_ROOM: 4,
                  DRIVER_LEFT_ROOM: 5,
                  DRIVER_GOT_ONLINE: 6,
                  DRIVER_GOT_OFFLINE: 7,
                  DRIVER_IS_READY: 8,
                  DRIVER_IS_NOT_READY: 9,
                  ADMIN_CHANGED: 10,
                  GLOBAL_CHAT: 11,
                  ROOM_CHAT: 12
            };

            //emitUpdate does three things; 1) Update Snapshots, 2) Send Public Updates To Everyone 3) Send Private Updates To Drivers in Rooms
            //Call emitUpdate after you are done with ActiveDrivers, ActiveRooms etc. Since emitUpdate is using them to create Snaphots.
            this.emitUpdate = [];
            this.emitUpdate[this.UpdateTypes.ROOM_CREATED] = function (room_public_view, admin_id) {
                  io.emit("update", { type: _that.UpdateTypes.ROOM_CREATED, data: { room_public_view } });
                  Snapshot[room_public_view.track_id].rooms[room_public_view.uuid] = room_public_view;
                  PrivateRoomSnapshots[room_public_view.uuid] = ActiveRooms[room_public_view.uuid];
                  for (var d in ActiveRooms[room_public_view.uuid].drivers) {
                        PrivateRoomSnapshots[room_public_view.uuid].drivers[d] = DriverPublicViewModel(ActiveDrivers[d].driver);
                  }
            };
            this.emitUpdate[this.UpdateTypes.ROOM_CLOSED] = function (track_id, room_id) {
                  io.emit("update", { type: _that.UpdateTypes.ROOM_CLOSED, data: { track_id, room_id } });
                  delete Snapshot[track_id].rooms[room_id];
                  delete PrivateRoomSnapshots[room_id];
            };
            this.emitUpdate[this.UpdateTypes.ROOM_ENTERED_RACE] = function (track_id, room_id) {
                  Snapshot[track_id].room_in_race = { uuid: room_id, track_id, drivers: {} };
                  for (var d in ActiveRooms[room_id].drivers) {
                        Snapshot[track_id].room_in_race.drivers[d] = { username: ActiveDrivers[d].driver };
                  }
                  //As we add the room to room_in_race, we remove it from the waiting queue.
                  delete Snapshot[track_id].rooms[room_id];
                  io.emit("update", { type: _that.UpdateTypes.ROOM_ENTERED_RACE, data: { room : Snapshot[track_id].room_in_race } });
            };
            this.emitUpdate[this.UpdateTypes.ROOM_FINISHED_RACE] = function (track_id, room_id, ranking) {
                  io.emit("update", { type: _that.UpdateTypes.ROOM_FINISHED_RACE, data: { track_id, room_id, ranking } });
                  Snapshot[track_id].room_in_race.ranking = ranking;
                  PrivateRoomSnapshots[room_id].ranking = ranking;
                  //TODO: On client side, check if room snapshot has ranking. If so, show ranking.
            };
            this.emitUpdate[this.UpdateTypes.DRIVER_JOINED_ROOM] = function (track_id, room_id, driver_view) {
                  Snapshot[track_id].rooms[room_id].driver_count.not_ready++;
                  PrivateRoomSnapshots[room_id].drivers[driver_view.uuid] = driver_view;
                  //PrivateRoomSnapshots[room_id] = RoomPrivateViewModel(ActiveRooms[room_id]);
                  io.emit("update", { type: _that.UpdateTypes.DRIVER_JOINED_ROOM, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
                  io.to(room_id).emit("room-update", { type: _that.UpdateTypes.DRIVER_JOINED_ROOM, data: {  driver_view } });
            };
            this.emitUpdate[this.UpdateTypes.DRIVER_LEFT_ROOM] = function (track_id, room_id, driver_id) {
                  Snapshot[track_id].rooms[room_id] = RoomPublicViewModel(ActiveRooms[room_id]);
                  delete PrivateRoomSnapshots[room_id].drivers[driver_id];
                  //PrivateRoomSnapshots[room_id] = RoomPrivateViewModel(ActiveRooms[room_id]);
                  io.emit("update", { type: _that.UpdateTypes.DRIVER_LEFT_ROOM, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
                  io.to(room_id).emit("room-update", { type: _that.UpdateTypes.DRIVER_LEFT_ROOM, data: { driver_id } });
            };
            this.emitUpdate[this.UpdateTypes.DRIVER_GOT_ONLINE] = function (track_id, room_id, driver_id) {
                  Snapshot[track_id].rooms[room_id] = RoomPublicViewModel(ActiveRooms[room_id]);
                  PrivateRoomSnapshots[room_id].drivers[driver_id].status = Enum_Driver_Room_Status.NOT_READY;
                  //PrivateRoomSnapshots[room_id] = RoomPrivateViewModel(ActiveRooms[room_id]);
                  io.emit("update", { type: _that.UpdateTypes.DRIVER_GOT_ONLINE, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
                  io.to(room_id).emit("room-update", { type: _that.UpdateTypes.DRIVER_GOT_ONLINE, data: { driver_id } });
            };
            this.emitUpdate[this.UpdateTypes.DRIVER_GOT_OFFLINE] = function (track_id, room_id, driver_id) {
                  Snapshot[track_id].rooms[room_id] = RoomPublicViewModel(ActiveRooms[room_id]);
                  PrivateRoomSnapshots[room_id].drivers[driver_id].status = Enum_Driver_Room_Status.OFFLINE;
                  //PrivateRoomSnapshots[room_id] = RoomPrivateViewModel(ActiveRooms[room_id]);
                  io.emit("update", { type: _that.UpdateTypes.DRIVER_GOT_OFFLINE, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
                  io.to(room_id).emit("room-update", { type: _that.UpdateTypes.DRIVER_GOT_OFFLINE, data: { driver_id } });
            };
            this.emitUpdate[this.UpdateTypes.DRIVER_IS_READY] = function (track_id, room_id, driver_id) {
                  Snapshot[track_id].rooms[room_id] = RoomPublicViewModel(ActiveRooms[room_id]);
                  PrivateRoomSnapshots[room_id].drivers[driver_id].status = Enum_Driver_Room_Status.READY;
                  //PrivateRoomSnapshots[room_id] = RoomPrivateViewModel(ActiveRooms[room_id]);
                  io.emit("update", { type: _that.UpdateTypes.DRIVER_IS_READY, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
                  io.to(room_id).emit("room-update", { type: _that.UpdateTypes.DRIVER_IS_READY, data: { driver_id } });
            };
            this.emitUpdate[this.UpdateTypes.DRIVER_IS_NOT_READY] = function (track_id, room_id, driver_id) {
                  Snapshot[track_id].rooms[room_id] = RoomPublicViewModel(ActiveRooms[room_id]);
                  PrivateRoomSnapshots[room_id].drivers[driver_id].status = Enum_Driver_Room_Status.NOT_READY;
                  //PrivateRoomSnapshots[room_id] = RoomPrivateViewModel(ActiveRooms[room_id]);
                  io.emit("update", { type: _that.UpdateTypes.DRIVER_IS_NOT_READY, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
                  io.to(room_id).emit("room-update", { type: _that.UpdateTypes.DRIVER_IS_NOT_READY, data: { driver_id } });
            };
            this.emitUpdate[this.UpdateTypes.ADMIN_CHANGED] = function (room_id, driver_id) {
                  io.to(room_id).emit("room-update", { type: _that.UpdateTypes.ADMIN_CHANGED, data: { driver_id } });
                  PrivateRoomSnapshots[room_id].admin_id = driver_id;
            };
            this.emitUpdate[this.UpdateTypes.GLOBAL_CHAT] = function (track_id, username, text) {
                  Snapshot[track_id].chat.push({ username, text });
                  io.emit("update", { type: _that.UpdateTypes.GLOBAL_CHAT, data: { track_id, username, text } });
            };
            this.emitUpdate[this.UpdateTypes.ROOM_CHAT] = function (room_id, username, text) {
                  PrivateRoomSnapshots[room_id].chat.push({ username, text });
                  io.to(room_id).emit("room-update", { type: _that.UpdateTypes.ROOM_CHAT, data: { username, text } });
            };

      };

      function RemoveDriverFromRoom(driverid) {
            var room = ActiveDrivers[driverid].room;
            //remove driver from the room
            if (room && room.drivers[driverid]) {
                  if(ActiveDrivers[driverid].socket){
                        ActiveDrivers[driverid].socket.leave(room.uuid);
                  }
                  delete room.drivers[driverid];
                  delete ActiveDrivers[driverid].room;
                  //if this was the only driver in the room, close the room.
                  if (Object.keys(room.drivers).length <= 0) {
                        room.status = Enum_Room_Status.CLOSED;
                        delete ActiveRooms[room.uuid];
                        //If we close the room, we do not need to send a DRIVER_LEFT_ROOM update. ROOM_CLOSED update is enough.
                        UpdateManager.emitUpdate[UpdateManager.UpdateTypes.ROOM_CLOSED](room.track_id, room.uuid);
                  } else {
                        if (room.admin_id == driverid) {
                              //If this player was the admin of the room, set second driver as new admin and let drivers in the room know that.
                              for (uuid in room.drivers) {
                                    if (uuid != driverid) {
                                          room.admin_id = uuid;
                                          UpdateManager.emitUpdate[UpdateManager.UpdateTypes.ADMIN_CHANGED](room.uuid, room.admin_id);
                                          break;
                                    }
                              }
                        }
                        UpdateManager.emitUpdate[UpdateManager.UpdateTypes.DRIVER_LEFT_ROOM](room.track_id, room.uuid, driverid);
                  }
                  room.markModified("drivers");
                  room.save();
                  if (ActiveDrivers[driverid].status == Enum_Driver_Status.CONNECTED_TO_LOCAL_SERVER)
                        localServer.disconnectDriver(driverid);
                  if(ActiveDrivers[driverid].socket && ActiveDrivers[driverid].socket.connected){
                        ActiveDrivers[driverid].driver.status = Enum_Driver_Status.ONLINE;
                        ActiveDrivers[driverid].driver.save();
                  }
            }
      }

      ioadmin = io.of('/tradmin');
      ioadmin.on('connection', function (socket) {
            console.log('Admin connected');

            socket.on('authenticate', (data, callback) => {
                  //check if all info given (username&&password or token)
                  if (data.token) {
                        Jwt.verify(data.token, process.env.SECRET_KEY, function (err, admin) {
                              if (err || !admin) {
                                    callback({ success: false, reason: Enum_Callback_Reason.TOKEN_EXPIRED, error: err }); //"Jwt error"
                                    return;
                              }
                              //Check if this admin id has a info in ActiveAdmins. If so, dont allow him to login from here.
                              if (ActiveAdmins[admin.uuid]) {
                                    callback({ success: false, reason: Enum_Callback_Reason.ALREADY_LOGGED_IN });
                                    return;
                              }
                              Driver.findOne({ uuid: admin.uuid }, function (err, a) {
                                    if (err) {
                                          callback({ success: false, reason: Enum_Callback_Reason.DB_ERROR, error: err });
                                          return;
                                    }
                                    if (!a) {
                                          callback({ success: false, reason: Enum_Callback_Reason.WRONG_CREDENTIALS });
                                          return;
                                    }
                                    socket.admin = a;
                                    ActiveAdmins[admin.uuid] = { admin: a, socket: socket };
                                    //send admin info back
                                    callback({ success: true, token: createNewToken({ uuid: a.uuid, username: a.username }) });
                              });

                        });
                  } else if (data.username && data.password) {
                        //Check username and password from DB                
                        if (!db) {
                              callback({ success: false, reason: Enum_Callback_Reason.DB_ERROR });
                              return;
                        }
                        Driver.findOne({ username: data.username, password: data.password }, function (err, admin) {
                              if (err) {
                                    callback({ success: false, reason: Enum_Callback_Reason.DB_ERROR, error: err });
                                    return;
                              }
                              if (!admin) {
                                    callback({ success: false, reason: Enum_Callback_Reason.WRONG_CREDENTIALS });
                                    return;
                              }
                              //Check if this admin id has an item in ActiveAdmins. If so, dont allow him to login from here.
                              if (ActiveAdmins[admin.uuid]) {
                                    callback({ success: false, reason: Enum_Callback_Reason.ALREADY_LOGGED_IN });
                                    return;
                              }
                              socket.admin = admin;
                              ActiveAdmins[admin.uuid] = { admin: admin, socket: socket };
                              //send driver info back
                              callback({ success: true, token: createNewToken({ uuid: admin.uuid, username: admin.username }) });
                              return;
                        });
                  } else {
                        callback({ success: false, reason: Enum_Callback_Reason.MISSING_INFO });
                        return;
                  }
            });

            /* 
            Admin Commands
            
            - Get Snaphot: Send the current snapshot.
            - Start Race
            - Pause Race: LS will set racePaused: true, and will not relay Driver commands to Cars.
            - Resume Race
            - Abort Race: LS will cut connection to all Drivers in the current race.
            - Take Next Room In: LS will cut connection to all Drivers in the current race.
            - Control Car: Just relay command to LS.
            - Remove Driver From The Room: LS will disconnect the Driver.
            - Stream the Car to the Driver
            - Cut stream of the Driver
            - Give control of the Car to the Driver
            - Cut control of the Driver
            - Move Car to another Track
       
            
            
            */

            socket.on('getsnapshot', () => {
                  //Send Tracks, Rooms and Drivers.
                  socket.emit("snapshot", Snapshot);
            });

            socket.on('startrace', (data, callback) => {
                  //LS will give control to all drivers in the race and set race->is_started to TRUE;
                  localServer.startRace(data.race_id);
            });

            socket.on('pauserace', (data, callback) => {
                  //LS will set race->is_paused to TRUE and stop increasing race->elapsed_time.
                  localServer.pauseRace(data.race_id);
            });

            socket.on('resumerace', (data, callback) => {
                  //LS will set race->is_paused to FALSE to remove controls and to stop increasing race->elapsed_time.
                  localServer.resumeRace(data.race_id);
            });
            socket.on('endrace', (data, callback) => {
                  //LS will calculate ratings and send them to both drivers and Web Server. Then, LS will disconnect drivers.
                  localServer.endRace(data.race_id);
            });

            socket.on('abortrace', (data, callback) => {
                  //LS will send a abort message to drivers and disconnect them and remove race.
                  localServer.abortRace(data.race_id);
            });

            socket.on('takenextroomin', (data, callback) => {
                  //TODO: If the current room is still in race, return false with reason STILL_IN_RACE.


                  //Take first ready room in the queue of the selected track to the game waiting screen.
                  //Send createrace command to LS with driver and car ids.
                  var room = GetNextRoomByTrackId(data.track_id);
                  room.status = Enum_Room_Status.IN_PRE_RACE;
                  var driver_ids = [];
                  for(var driver_id in room.drivers)
                        driver_ids.push(driver_id);

                  localServer.createRace(data.race_id, data.max_duration, driver_ids, data.car_ids);
                  
                  UpdateManager.emitUpdate[UpdateManager.UpdateTypes.ROOM_ENTERED_RACE](room.track_id, room.uuid);
            });

            socket.on('controlcar', (data, callback) => {
                  localServer.controlCar(data.car_id, data.throttle, data.steering);
            });

            socket.on('removedriver', (data, callback) => {
                  //Remove Driver from the room and disconnect from LS. Direct him to result screen and show him as kicked.
                  localServer.RemoveDriverFromRoom(data.driver_id);
            });

            socket.on('connecttodrivermodified', (data, callback) => {
                  //Tell LS to stream Car camera to the Driver.
                  localServer.connectToDriver(data.driver_id);
                  callback({success: true});
            });
            socket.on('watch', (data, callback) => {
                  //Tell LS to stream Car camera to the Driver.
                  localServer.watch(data.driver_id);
                  callback({success: true});
            });
            socket.on('setdriverofcar', (data, callback) => {
                  //Tell LS to stream Car camera to the Driver.
                  localServer.setDriverOfCar(data.driver_id, data.car_id);
                  callback({success: true});
            });
            socket.on('startrecording', (data, callback) => {
                  //Tell LS to stream Car camera to the Driver.
                  localServer.startRecording(data.driver_id);
                  callback({success: true});
            });

            socket.on('stoprecording', (data, callback) => {
                  //Tell LS to stream Car camera to the Driver.
                  localServer.stopRecording(data.driver_id);
                  callback({success: true});
            });

            socket.on('streamtodrivermodified', (data, callback) => {
                  //Tell LS to stream Car camera to the Driver.
                  localServer.streamToDriverModified(data.driver_id);
                  callback({success: true});
            });

            socket.on('streamtodriver', (data, callback) => {
                  //Tell LS to stream Car camera to the Driver.
                  localServer.streamToDriver(data.driver_id, data.car_id);
            });

            socket.on('stopstream', (data, callback) => {
                  //Tell LS to stop streaming to this Driver.
                  localServer.stopStreamToDriver(data.driver_id);
            });

            socket.on('givecontrol', (data, callback) => {
                  //Tell LS to give control of the Car to this Driver.
                  localServer.giveControlToDriver(data.driver_id, data.car_id);
            });

            socket.on('cutcontrol', (data, callback) => {
                  //Tell LS to remove control of the Car of this Driver.
                  localServer.cutControlOfDriver(data.driver_id);
            });

      });

};

function createNewToken(data, expiresIn) {
      var token = Jwt.sign(data, process.env.SECRET_KEY, {
            expiresIn: expiresIn || (60 * 60 * 24) //in seconds
      });
      return token;
}


var localServerCallbacks = {
      on_offer: function (driverId, sdp, isleft) {
            //COMMENT OUT HERE #################################################
            //COMMENT OUT HERE #################################################
            //COMMENT OUT HERE #################################################
            // if (!(ActiveDrivers[driverId] && ActiveDrivers[driverId].socket && ActiveDrivers[driverId].driver.status == Enum_Driver_Status.ONLINE)) {
            //       localServer.disconnectDriver(driverId);
            //       return;
            // }
            ActiveDrivers[driverId].socket.emit("offer", { sdp, isleft });
      },
      on_webrctup: function (driverId) {
            //Check if driver is in a room and room has a status IN_RACE, if so, connect him to the car
            if (!ActiveDrivers[driverId]) {
                  localServer.disconnectDriver(driverId);
                  return;
            }

            var driver = ActiveDrivers[driverId].driver;
            var socket = ActiveDrivers[driverId].socket;
            var room = ActiveDrivers[driverId].room;

            if (!room) {
                  localServer.disconnectDriver(driverId);
                  driver.status = Enum_Driver_Status.ONLINE;
                  driver.save();
                  return;
            }

            if (room.drivers[driverId]) {
                  //Only if the room is in Race, check if there is controlled and streamed car ids
                  if (room.status == Enum_Room_Status.CREATING) {
                        room.status = Enum_Room_Status.IN_QUEUE;
                        room.save();
                  } else if (room.status == Enum_Room_Status.IN_RACE) {
                        //If controlled and streamed car ids exist and equal, start stream and control to that car
                        if (room.drivers[driverId].controlled_car_id && room.drivers[driverId].streamed_car_id && room.drivers[driverId].controlled_car_id == room.drivers[driverId].streamed_car_id) {
                              localServer.startStreamAndControl(driverId, room.drivers[driverId].controlled_car_id);
                        } else {
                              //both controlled car id and streamed car id may exist but be different
                              //if controlled car id exist, start control to that car
                              if (room.drivers[driverId].controlled_car_id) {
                                    localServer.giveControlToDriver(driverId, room.drivers[driverId].controlled_car_id);
                              }
                              //if streamed car id exist, start stream to that car
                              if (room.drivers[driverId].streamed_car_id) {
                                    localServer.streamToDriver(driverId, room.drivers[driverId].streamed_car_id);
                              }
                        }
                  }
                  //If Room is closed, driver do not need to be here anymore
                  else if (room.status == Enum_Room_Status.CLOSED) {
                        //This is unlikely but may happen.
                        //Room is closed already. So cut the Webrtc connection and change status of the driver.
                        driver.status = Enum_Driver_Status.ONLINE;
                        driver.save();
                        RemoveDriverFromRoom(driver.uuid);
                        return;
                  }
                  driver.status = Enum_Driver_Status.CONNECTED_TO_LOCAL_SERVER;
                  socket.join(room.uuid);
                  return;
            }
      },
      on_hangup: function (driverId) {
            //Driver got disconnected from Local Server. If driver is still connected to Web Server, we should try to connect him to LS again.
            //If driver also disconnected from here, we will just wait him to come again. If he doesnt come, timeout in onDisconnect() will remove him from the room.
      },
      on_carconnected: function (carId) {
            //TODO: Notify Admins
            ActiveCars[carId] = { track_id: null, status: "online" }
      },
      on_cardisconnected: function (carId) {
            //TODO: Notify Admins
            if(ActiveCars[carId])
                  ActiveCars[carId].status = "offline";
      }
};

var RoomPrivateViewModel = function (room) {
      var model = {
            uuid: room.uuid,
            track_id: room.track_id,
            admin_id: room.admin_id,
            name: room.name,
            status: room.status,
            drivers: {},
            is_locked: room.password != null && room.password != "",
            chat: []
      };
      for(var c=0;c<room.chat.length;c++){
            model.chat.push(room.chat[c]);
      }
      for(var driver_uuid in room.drivers){
            if(ActiveDrivers[driver_uuid]){
                  model.drivers[driver_uuid] = DriverPublicViewModel(ActiveDrivers[driver_uuid].driver);
            }
      }
      return model;
};

var RoomPublicViewModel = function (room) {
      var model = {
            uuid: room.uuid,
            track_id: room.track_id,
            name: room.name,
            status: room.status,
            driver_count: {offline: 0, not_ready: 0, ready: 0},
            is_locked: room.password != null && room.password != "",
            create_date: room.create_date
      };
      var offline = 0;
      var not_ready = 0;
      var ready = 0;
      for(var driver in room.drivers){
            if(room.drivers[driver].status == Enum_Driver_Room_Status.OFFLINE)
                  model.driver_count.offline++;
            if(room.drivers[driver].status == Enum_Driver_Room_Status.NOT_READY)
                  model.driver_count.not_ready++;
            if(room.drivers[driver].status == Enum_Driver_Room_Status.READY)
                  model.driver_count.ready++;
      }
      return model;
};

var DriverPrivateViewModel = function (driver) {
      return {
            uuid: driver.uuid,
            username: driver.username,
            email: driver.email,
            coin: driver.coin,
            xp: driver.xp,
            bronze_medal: driver.bronze_medal,
            silver_medal: driver.silver_medal,
            gold_medal: driver.gold_medal,
            in_room: ActiveDrivers[driver.uuid] && ActiveDrivers[driver.uuid].room
      };
};
var DriverPublicViewModel = function (driver) {
      var status;
      if(!ActiveDrivers[driver.uuid]){
            status = Enum_Driver_Room_Status.OFFLINE;
      }else if(ActiveDrivers[driver.uuid].room && ActiveDrivers[driver.uuid].room.drivers[driver.uuid]){
            status = ActiveDrivers[driver.uuid].room.drivers[driver.uuid].status;
      }else{
            status = Enum_Driver_Room_Status.NOT_READY;
      }
      return {
            uuid: driver.uuid,
            username: driver.username,
            status: status, //this is driver room status.
            xp: driver.xp,
            bronze_medal: driver.bronze_medal,
            silver_medal: driver.silver_medal,
            gold_medal: driver.gold_medal
      };
};
