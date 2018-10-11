
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
const ActiveTracks = {};
const DriverTimeouts = {}; //Put timeouts by driver id. When a driver disconnect while he is in a room in queue, create a timeout and keep it here. If he connects back before timeout, stop this timeout.
const ActiveAdmins = {};

const Snapshot = {}; //Keep ActiveTracks, rooms and cars in it.
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
         "driveruuid1": driver.username
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
   READY: 2,
   LEFT: 3,
   KICKED: 4
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

const Enum_Race_Status = {
   NOT_STARTED: 0,
   STARTED: 1,
   FINISHED: 2,
   ABORTED: 3
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
   WRONG_ROOM_PASSWORD: 8,
   SAME_USERNAME_OR_EMAIL_EXIST: 9,
   NO_TRACK_WITH_GIVEN_ID: 10,
   NO_ROOM_WITH_GIVEN_ID: 11,
   DRIVER_IS_NOT_IN_A_ROOM: 12,
   STILL_IN_RACE: 13, //If admin tries to take next room in while there is a race running on a track, we will send this reason.
   NO_READY_ROOM_IN_QUEUE: 14,
   NO_ROOM_IN_RACE: 15,
   LOCAL_SERVER_IS_DOWN: 16
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
      Track.find({ is_active: true }, function (err, tracks) {
         if (err) {
            console.log("Error while getting Tracks from DB.-> " + err);
            return;
         }
         for (var t = 0; t < tracks.length; t++) {
            ActiveTracks[tracks[t].uuid] = tracks[t];
            Snapshot[tracks[t].uuid] = {
               name: tracks[t].name,
               rooms: {},
               chat: []
            };
            GetRoomsToSnapshot(tracks[t]);
         }

      });


      setTimeout(() => {
         //Wait for all info to load from DB then start the socket server.
         main(httpServer);
      }, 3000);
   });

   function GetRoomsToSnapshot(track) {
      Room.find({ track_id: track.uuid, status: { $ne: Enum_Room_Status.CLOSED } }, function (err, rooms) {
         if (err) {
            console.log("Error while getting Rooms from DB.-> " + err);
            return;
         }
         for (var r = 0; r < rooms.length; r++) {
            var isThereAnActiveDriver = false;
            for (var uuid in rooms[r].drivers) {
               if(rooms[r].drivers[uuid].status != Enum_Driver_Room_Status.KICKED && rooms[r].drivers[uuid].status != Enum_Driver_Room_Status.LEFT){
                  isThereAnActiveDriver = true;
                  ActiveDrivers[uuid] = { room: rooms[r] };
                  //Set Driver status offline.
                  rooms[r].drivers[uuid].status = Enum_Driver_Room_Status.OFFLINE;
                  GetDriverToSnapshot(uuid, rooms[r].uuid, track);
               }
            }
            if(!isThereAnActiveDriver){
               rooms[r].status = Enum_Room_Status.CLOSED;
               rooms[r].save();
               break;
            }
            //If this is the room in race, we get its info to snapshot room_in_race.
            if (rooms[r].uuid == track.room_id_in_race) {
               Snapshot[track.uuid].room_in_race = {
                  uuid: rooms[r].uuid,
                  track_id: rooms[r].track_id,
                  drivers: {}, //{ uuid: username }
                  ranking: []
               };
               if (rooms[r].race && rooms[r].race.ranking)
                  for (var r = 0; r < rooms[r].race.ranking.length; r++)
                     Snapshot[track.uuid].room_in_race.ranking[r] = rooms[r].race.ranking[r];
            }

            ActiveRooms[rooms[r].uuid] = rooms[r];
            PrivateRoomSnapshots[rooms[r].uuid] = RoomPrivateViewModel(rooms[r]);
            var snapshotRoom = RoomPublicViewModel(rooms[r]);
            Snapshot[rooms[r].track_id].rooms[rooms[r].uuid] = snapshotRoom;
         }

      });
   }

   function GetDriverToSnapshot(driver_id, room_id, track) {
      Driver.findOne({ uuid: driver_id }, function (err, driver) {
         if (err) {
            console.log("Error retriving driver from DB. -> " + err);
            return;
         }
         if (driver) {
            //If this is the room in race, we get drivers info.
            if (room_id == track.room_id_in_race) {
               Snapshot[track.uuid].room_in_race.drivers[driver.uuid] = driver.username;
            }
            ActiveDrivers[driver.uuid].driver = driver;
            PrivateRoomSnapshots[room_id].drivers[driver.uuid] = DriverPublicViewModel(driver);
         }
      });
   }

   db.on("error", function (err) {
      throw err;
   });
};

function main(httpServer) {
   localServer.start(localServerCallbacks, ActiveTracks);

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
         if (socket.driver && ActiveTracks[data.track_id])
            UpdateManager.emitUpdate[UpdateManager.UpdateTypes.GLOBAL_CHAT](data.track_id, socket.driver.username, data.text);
      });

      socket.on('room-chat', data => {
         //Emit to room if roomId exist
         if (socket.driver && ActiveDrivers[socket.driver.uuid].room) {
            var room = ActiveDrivers[socket.driver.uuid].room;
            room.chat.push({ username: socket.driver.username, text: data.text });
            ActiveDrivers[socket.driver.uuid].room.save();
            UpdateManager.emitUpdate[UpdateManager.UpdateTypes.ROOM_CHAT](ActiveDrivers[socket.driver.uuid].room.uuid, socket.driver.username, data.text);
         }
      });

      socket.on('answer', (data, callback) => {
         if (!socket.driver || !data.sdp)
            return;
            callback({success: localServer.sendAnswerSdp(data.track_id, socket.driver.uuid, data.sdp, data.isleft)});
      });

      socket.on('candidate', (data, callback) => {
         console.log(data);
         if (!socket.driver)
            return;
         callback({success: localServer.sendCandidate(data.track_id, socket.driver.uuid, data.candidate, data.isleft)});
      });

      socket.on('ready', (callback) => {
         if (!socket.driver || !ActiveDrivers[socket.driver.uuid].room)
            return;
         var room = ActiveDrivers[socket.driver.uuid].room;
         room.drivers[socket.driver.uuid].status = Enum_Driver_Room_Status.READY;
         //Check if driver count is more than 1 and all drivers are ready. Then set room status to Ready.
         var ready = 0;
         for (var d in room.drivers) {
            if (room.drivers[d].status == Enum_Driver_Room_Status.OFFLINE || room.drivers[d].status == Enum_Driver_Room_Status.NOT_READY) {
               ready = 0;
               break; //We leave since someone is not ready
            } else if (room.drivers[d].status == Enum_Driver_Room_Status.READY)
               ready++;
         }
         //########################################################################################################################
         //TODO: Burası > 1 olacak!!!! Yani odada en az iki kişi olmalı odanın hazır olması için. TEST amaçlı 0 yapıldı.
         //########################################################################################################################
         if (ready > 0) {
            room.status = Enum_Room_Status.IN_QUEUE_READY;
         }
         //########################################################################################################################
         //########################################################################################################################
         room.save();
         UpdateManager.emitUpdate[UpdateManager.UpdateTypes.DRIVER_IS_READY](ActiveDrivers[socket.driver.uuid].room.track_id, ActiveDrivers[socket.driver.uuid].room.uuid, socket.driver.uuid);
         callback({ success: true });
      });

      socket.on('notready', (callback) => {
         if (!socket.driver || !ActiveDrivers[socket.driver.uuid].room)
            return;
         ActiveDrivers[socket.driver.uuid].room.drivers[socket.driver.uuid].status = Enum_Driver_Room_Status.NOT_READY;
         ActiveDrivers[socket.driver.uuid].room.status = Enum_Room_Status.IN_QUEUE;
         ActiveDrivers[socket.driver.uuid].room.save();
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
                  if (ActiveDrivers[driver.uuid].socket.connected) {
                     callback({ success: false, reason: Enum_Callback_Reason.ALREADY_LOGGED_IN }); //"Already logged in from another tab."
                     return;
                  } else {
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
         if (!ActiveDrivers[socket.driver.uuid].room || !ActiveRooms[ActiveDrivers[socket.driver.uuid].room.uuid]) {
            callback({ success: false, reason: Enum_Callback_Reason.DRIVER_IS_NOT_IN_A_ROOM });
            return;
         }

         callback({ success: true, room_private_view: RoomPrivateViewModel(ActiveDrivers[socket.driver.uuid].room) });
      });

      socket.on('leave-room', (data, callback) => {
         if (!socket.driver || !ActiveDrivers[socket.driver.uuid].room) {
            return;
         }
         //We send update in this function.
         if(RemoveDriverFromRoom(socket.driver.uuid, true)){
            callback({ success: true });
         }else{
            callback({ success: false });
         }
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
         if (!ActiveTracks[data.track_id]) {
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
            newRoom.drivers[driver.uuid] = { status: Enum_Driver_Room_Status.NOT_READY };
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

         if (ActiveRooms[data.room_id].password && ActiveRooms[data.room_id].password != data.password) {
            callback({ success: false, reason: Enum_Callback_Reason.WRONG_ROOM_PASSWORD });
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
               room.drivers[driver.uuid] = { status: Enum_Driver_Room_Status.NOT_READY };
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
      if (ActiveDrivers[driver.uuid].room) {
         var room = ActiveDrivers[driver.uuid].room;
         room.drivers[driver.uuid].status = Enum_Driver_Room_Status.OFFLINE;
         room.markModified("drivers");
         room.save();
         //Remove driver from socket.io room too
         ActiveDrivers[driver.uuid].socket.leave(room.uuid);
         //let others in the room know this driver got offline
         UpdateManager.emitUpdate[UpdateManager.UpdateTypes.DRIVER_GOT_OFFLINE](room.track_id, room.uuid, driver.uuid);
         if (room.status == Enum_Room_Status.CREATING || room.status == Enum_Room_Status.IN_QUEUE || room.status == Enum_Room_Status.IN_QUEUE_READY) {
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
      }
      driver.status = Enum_Driver_Status.OFFLINE;
      driver.save();
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
      driver.last_login_date = Date.now();
      driver.save();
      //db.collection("drivers").updateOne({ _id: driver.uuid },{ $set:{ last_login_date: driver.last_login_date, status: driver.status }});
      //Create new token with expiration date
      _socket.emit('authenticate', { driver: DriverPrivateViewModel(driver), token: createNewToken(DriverPrivateViewModel(driver), 60 * 60 * 24) });

      //Check if driver was in a room and disconnected. If so, connect him to the room.
      //if room is not in ActiveRooms, delete driver's room.
      if (ActiveDrivers[driver.uuid].room && ActiveRooms[ActiveDrivers[driver.uuid].room.uuid]) {
         //Our beloved driver is online again. Emit an Update to the room.
         ActiveDrivers[driver.uuid].room.drivers[driver.uuid].status = Enum_Driver_Room_Status.NOT_READY;
         ActiveDrivers[driver.uuid].room.save();
         UpdateManager.emitUpdate[UpdateManager.UpdateTypes.DRIVER_GOT_ONLINE](ActiveDrivers[driver.uuid].room.track_id, ActiveDrivers[driver.uuid].room.uuid, driver.uuid);
         _socket.emit("room-snapshot", { room_private_view: PrivateRoomSnapshots[ActiveDrivers[driver.uuid].room.uuid] });
         _socket.join(ActiveDrivers[driver.uuid].room.uuid);
      } else {
         delete ActiveDrivers[driver.uuid].room;
      }
   }

   //This is used when TakeNextRoomIn is called.
   function GetNextRoomByTrackId(track_id) {
      var theroom;
      for (var room_id in ActiveRooms) {
         if (ActiveRooms[room_id].status == Enum_Room_Status.IN_QUEUE_READY && ActiveRooms[room_id].track_id == track_id && ActiveRooms[room_id].race == null && (!theroom || ActiveRooms[room_id].create_date < theroom.create_date))
            theroom = ActiveRooms[room_id];
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
         ioadmin.emit("update", { type: _that.UpdateTypes.ROOM_CREATED, data: { room_public_view } });
         Snapshot[room_public_view.track_id].rooms[room_public_view.uuid] = room_public_view;
         PrivateRoomSnapshots[room_public_view.uuid] = ActiveRooms[room_public_view.uuid];
         for (var d in ActiveRooms[room_public_view.uuid].drivers) {
            PrivateRoomSnapshots[room_public_view.uuid].drivers[d] = DriverPublicViewModel(ActiveDrivers[d].driver);
         }
      };
      this.emitUpdate[this.UpdateTypes.ROOM_CLOSED] = function (track_id, room_id) {
         io.emit("update", { type: _that.UpdateTypes.ROOM_CLOSED, data: { track_id, room_id } });
         ioadmin.emit("update", { type: _that.UpdateTypes.ROOM_CLOSED, data: { track_id, room_id } });
         delete Snapshot[track_id].rooms[room_id];
         delete PrivateRoomSnapshots[room_id];
      };
      this.emitUpdate[this.UpdateTypes.ROOM_ENTERED_RACE] = function (track_id, room_id) {
         Snapshot[track_id].room_in_race = { uuid: room_id, track_id, drivers: {} };
         for (var d in ActiveRooms[room_id].drivers) {
            Snapshot[track_id].room_in_race.drivers[d] = ActiveDrivers[d].driver.username;
         }
         ActiveRooms[room_id].status = Enum_Room_Status.IN_PRE_RACE;
         //As we add the room to room_in_race, we remove it from the waiting queue. It still exists on ActiveRooms.
         delete Snapshot[track_id].rooms[room_id];
         io.emit("update", { type: _that.UpdateTypes.ROOM_ENTERED_RACE, data: { room: Snapshot[track_id].room_in_race } });
         ioadmin.emit("update", { type: _that.UpdateTypes.ROOM_ENTERED_RACE, data: { room: Snapshot[track_id].room_in_race } });
      };
      this.emitUpdate[this.UpdateTypes.ROOM_FINISHED_RACE] = function (track_id, room_id, ranking) {
         io.emit("update", { type: _that.UpdateTypes.ROOM_FINISHED_RACE, data: { track_id, room_id, ranking } });
         ioadmin.emit("update", { type: _that.UpdateTypes.ROOM_FINISHED_RACE, data: { track_id, room_id, ranking } });
         Snapshot[track_id].room_in_race.ranking = ranking;
         PrivateRoomSnapshots[room_id].ranking = ranking;
         //TODO: On client side, check if room snapshot has ranking. If so, show ranking.
      };
      this.emitUpdate[this.UpdateTypes.DRIVER_JOINED_ROOM] = function (track_id, room_id, driver_view) {
         Snapshot[track_id].rooms[room_id].driver_count.not_ready++;
         PrivateRoomSnapshots[room_id].drivers[driver_view.uuid] = driver_view;
         io.emit("update", { type: _that.UpdateTypes.DRIVER_JOINED_ROOM, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
         ioadmin.emit("update", { type: _that.UpdateTypes.DRIVER_JOINED_ROOM, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
         io.to(room_id).emit("room-update", { type: _that.UpdateTypes.DRIVER_JOINED_ROOM, data: { driver_view } });
      };
      this.emitUpdate[this.UpdateTypes.DRIVER_LEFT_ROOM] = function (track_id, room_id, driver_id) {
         Snapshot[track_id].rooms[room_id] = RoomPublicViewModel(ActiveRooms[room_id]);
         delete PrivateRoomSnapshots[room_id].drivers[driver_id];
         io.emit("update", { type: _that.UpdateTypes.DRIVER_LEFT_ROOM, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
         ioadmin.emit("update", { type: _that.UpdateTypes.DRIVER_LEFT_ROOM, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
         io.to(room_id).emit("room-update", { type: _that.UpdateTypes.DRIVER_LEFT_ROOM, data: { driver_id } });
      };
      this.emitUpdate[this.UpdateTypes.DRIVER_GOT_ONLINE] = function (track_id, room_id, driver_id) {
         Snapshot[track_id].rooms[room_id] = RoomPublicViewModel(ActiveRooms[room_id]);
         PrivateRoomSnapshots[room_id].drivers[driver_id].status = Enum_Driver_Room_Status.NOT_READY;
         io.emit("update", { type: _that.UpdateTypes.DRIVER_GOT_ONLINE, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
         ioadmin.emit("update", { type: _that.UpdateTypes.DRIVER_GOT_ONLINE, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
         io.to(room_id).emit("room-update", { type: _that.UpdateTypes.DRIVER_GOT_ONLINE, data: { driver_id } });
      };
      this.emitUpdate[this.UpdateTypes.DRIVER_GOT_OFFLINE] = function (track_id, room_id, driver_id) {
         Snapshot[track_id].rooms[room_id] = RoomPublicViewModel(ActiveRooms[room_id]);
         PrivateRoomSnapshots[room_id].drivers[driver_id].status = Enum_Driver_Room_Status.OFFLINE;
         io.emit("update", { type: _that.UpdateTypes.DRIVER_GOT_OFFLINE, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
         ioadmin.emit("update", { type: _that.UpdateTypes.DRIVER_GOT_OFFLINE, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
         io.to(room_id).emit("room-update", { type: _that.UpdateTypes.DRIVER_GOT_OFFLINE, data: { driver_id } });
      };
      this.emitUpdate[this.UpdateTypes.DRIVER_IS_READY] = function (track_id, room_id, driver_id) {
         Snapshot[track_id].rooms[room_id] = RoomPublicViewModel(ActiveRooms[room_id]);
         PrivateRoomSnapshots[room_id].drivers[driver_id].status = Enum_Driver_Room_Status.READY;
         io.emit("update", { type: _that.UpdateTypes.DRIVER_IS_READY, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
         ioadmin.emit("update", { type: _that.UpdateTypes.DRIVER_IS_READY, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
         io.to(room_id).emit("room-update", { type: _that.UpdateTypes.DRIVER_IS_READY, data: { driver_id } });
      };
      this.emitUpdate[this.UpdateTypes.DRIVER_IS_NOT_READY] = function (track_id, room_id, driver_id) {
         Snapshot[track_id].rooms[room_id] = RoomPublicViewModel(ActiveRooms[room_id]);
         PrivateRoomSnapshots[room_id].drivers[driver_id].status = Enum_Driver_Room_Status.NOT_READY;
         io.emit("update", { type: _that.UpdateTypes.DRIVER_IS_NOT_READY, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
         ioadmin.emit("update", { type: _that.UpdateTypes.DRIVER_IS_NOT_READY, data: { track_id, room_id, driver_count: Snapshot[track_id].rooms[room_id].driver_count } });
         io.to(room_id).emit("room-update", { type: _that.UpdateTypes.DRIVER_IS_NOT_READY, data: { driver_id } });
      };
      this.emitUpdate[this.UpdateTypes.ADMIN_CHANGED] = function (room_id, driver_id) {
         io.to(room_id).emit("room-update", { type: _that.UpdateTypes.ADMIN_CHANGED, data: { driver_id } });
         PrivateRoomSnapshots[room_id].admin_id = driver_id;
      };
      this.emitUpdate[this.UpdateTypes.GLOBAL_CHAT] = function (track_id, username, text) {
         Snapshot[track_id].chat.push({ username, text });
         io.emit("update", { type: _that.UpdateTypes.GLOBAL_CHAT, data: { track_id, username, text } });
         ioadmin.emit("update", { type: _that.UpdateTypes.GLOBAL_CHAT, data: { track_id, username, text } });
      };
      this.emitUpdate[this.UpdateTypes.ROOM_CHAT] = function (room_id, username, text) {
         PrivateRoomSnapshots[room_id].chat.push({ username, text });
         io.to(room_id).emit("room-update", { type: _that.UpdateTypes.ROOM_CHAT, data: { username, text } });
      };

   };

   function RemoveDriverFromRoom(driverid, force) {
      if (!ActiveDrivers[driverid]) {
         console.log("There is no driver to remove form room.");
         return false;
      }
      var room = ActiveDrivers[driverid].room;
      if (!room) {
         console.log("The driver has no room to remove from.");
         return false;
      }
      if (!room.drivers[driverid]) {
         console.log("The room does NOT have this driver.");
         delete ActiveDrivers[driverid].room;
         return false;
      }
      //Do NOT remove driver if his room was taken to the race area. If force==true, then this driver is kicked either by system admin or room admin.
      if (!force &&
         (room.status == Enum_Room_Status.IN_PRE_RACE ||
            room.status == Enum_Room_Status.IN_RACE ||
            room.status == Enum_Room_Status.IN_RACE_RESULT))
         return false;
      //remove driver's socket from the room line
      if (ActiveDrivers[driverid].socket) {
         ActiveDrivers[driverid].socket.leave(room.uuid);
      }
      localServer.disconnectDriver(room.track_id, driverid);
      room.drivers[driverid].status = force ? Enum_Driver_Room_Status.KICKED : Enum_Driver_Room_Status.LEFT;
      delete ActiveDrivers[driverid].room;
      //if this was the only driver in the room, close the room.
      var isThereAnActiveDriver = false;
      for(var dId in room.drivers){
         if(room.drivers[dId].status != Enum_Driver_Room_Status.KICKED && room.drivers[dId].status != Enum_Driver_Room_Status.LEFT){
            isThereAnActiveDriver=true;
            break;
         }
      }
      if (!isThereAnActiveDriver) {
         room.status = Enum_Room_Status.CLOSED;
         delete ActiveRooms[room.uuid];
         //If we close the room, we do not need to send a DRIVER_LEFT_ROOM update. ROOM_CLOSED update is enough.
         UpdateManager.emitUpdate[UpdateManager.UpdateTypes.ROOM_CLOSED](room.track_id, room.uuid);
      } else {
         if (room.admin_id == driverid) {
            //If this player was the admin of the room, set second driver as new admin and let drivers in the room know that.
            for (uuid in room.drivers) {
               if (uuid != driverid && room.drivers[uuid].status != Enum_Driver_Room_Status.KICKED && room.drivers[uuid].status != Enum_Driver_Room_Status.LEFT) {
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


      //TODO: Bu kod burda olmamali bence. Neden yazdığını öğren ve daha doğru bir yere taşı.
      if (ActiveDrivers[driverid].socket && ActiveDrivers[driverid].socket.connected) {
         ActiveDrivers[driverid].driver.status = Enum_Driver_Status.ONLINE;
         ActiveDrivers[driverid].driver.save();
      }
      return true;
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
               Admin.findOne({ uuid: admin.uuid }, function (err, a) {
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
            Admin.findOne({ username: data.username, password: data.password }, function (err, admin) {
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
               //send Admin info back
               callback({ success: true, token: createNewToken({ uuid: admin.uuid, username: admin.username }) });
               return;
            });
         } else {
            callback({ success: false, reason: Enum_Callback_Reason.MISSING_INFO });
            return;
         }
      });

      socket.on('disconnect', function () {
         console.log('Admin got disconnected!');
         if (socket.admin)
            delete ActiveAdmins[socket.admin.uuid];
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

      socket.on('getroominrace', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         var room_in_race = PrivateRoomSnapshots[ActiveTracks[data.track_id].room_id_in_race];
         if (!room_in_race) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_ROOM_IN_RACE });
            return;
         }
         socket.emit("roominrace", { room_in_race });
         callback({ success: true });
      });

      socket.on('getcars', () => {
         //Send Tracks, Rooms and Drivers.
         socket.emit("cars", { cars: ActiveCars });
      });

      socket.on('startrace', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         var room_in_race = ActiveRooms[ActiveTracks[data.track_id].room_id_in_race];
         if (!room_in_race) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_ROOM_IN_RACE });
            return;
         }
         //LS will start streaming and give control to all drivers in the race and set race->is_started to TRUE;
         if (!localServer.startRace(data.track_id, room_in_race.race.uuid)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
      });

      socket.on('pauserace', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         var room_in_race = ActiveRooms[ActiveTracks[data.track_id].room_id_in_race];
         if (!room_in_race) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_ROOM_IN_RACE });
            return;
         }
         //LS will set race->is_paused to TRUE to remove controls and to stop increasing race->elapsed_time.
         if (!localServer.pauseRace(data.track_id, room_in_race.race.uuid)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
      });

      socket.on('resumerace', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         var room_in_race = ActiveRooms[ActiveTracks[data.track_id].room_id_in_race];
         if (!room_in_race) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_ROOM_IN_RACE });
            return;
         }
         //LS will set race->is_paused to FALSE to give control back and start increasing race->elapsed_time again.
         if (!localServer.resumeRace(data.track_id, room_in_race.race.uuid)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
      });
      socket.on('endrace', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         var room_in_race = ActiveRooms[ActiveTracks[data.track_id].room_id_in_race];
         if (!room_in_race) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_ROOM_IN_RACE });
            return;
         }
         //LS will calculate ratings and send them to both drivers and Web Server. Then, LS will disconnect drivers.
         if (!localServer.endRace(data.track_id, room_in_race.race.uuid)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
      });

      socket.on('abortrace', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         var room_in_race = ActiveRooms[ActiveTracks[data.track_id].room_id_in_race];
         if (!room_in_race) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_ROOM_IN_RACE });
            return;
         }
         //LS will send a abort message to drivers and disconnect them and remove race.
         if (!localServer.abortRace(data.track_id, room_in_race.race.uuid)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
      });

      socket.on('takenextroomin', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         //If the current room is still in race, return false with reason STILL_IN_RACE.
         if (ActiveTracks[data.track_id].room_id_in_race) {
            var room_in_race = ActiveRooms[ActiveTracks[data.track_id].room_id_in_race];
            if(room_in_race){
               if (room_in_race.status != Enum_Room_Status.IN_RACE_RESULT) {
                  callback({ success: false, reason: Enum_Callback_Reason.STILL_IN_RACE });
                  return;
               } else {
                  //It is time to close the previous room.
                  room_in_race.status = Enum_Room_Status.CLOSED;
                  room_in_race.save();
                  delete ActiveRooms[room.uuid];
                  //If we close the room, we do not need to send a DRIVER_LEFT_ROOM update. ROOM_CLOSED update is enough.
                  UpdateManager.emitUpdate[UpdateManager.UpdateTypes.ROOM_CLOSED](room_in_race.track_id, room_in_race.uuid);
               }
            }
         }

         //Take first ready room in the queue of the selected track to the game waiting screen.
         //Connect all drivers to Local Server via WebRTC.
         var room = GetNextRoomByTrackId(data.track_id);
         if (!room) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_READY_ROOM_IN_QUEUE });
            return;
         }
         room.status = Enum_Room_Status.IN_PRE_RACE;
         room.race = {
            uuid: uuidv4(),
            status: Enum_Race_Status.NOT_STARTED,
            driver_cars: {}
         };
         var driver_ids = [];
         for (var driver_id in room.drivers) {
            driver_ids.push(driver_id);
            room.race.driver_cars[driver_id] = { streamed_car_id: null, controlled_car_id: null };
         }
         room.save();

         ActiveTracks[data.track_id].room_id_in_race = room.uuid;
         ActiveTracks[data.track_id].save();


         //Send createrace command to LS with driver ids.
         if (!localServer.createRace(data.track_id, room.race.uuid, data.max_duration, driver_ids)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
         callback({ success: true, race_id: room.race.uuid });
         socket.emit("roominrace", { room_in_race: PrivateRoomSnapshots[room.uuid] });
         UpdateManager.emitUpdate[UpdateManager.UpdateTypes.ROOM_ENTERED_RACE](room.track_id, room.uuid);
      });

      socket.on('controlcar', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         if (!localServer.controlCar(data.track_id, data.car_id, data.throttle, data.steering)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
      });

      socket.on('removedriver', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         //Remove Driver from the room and disconnect from LS. Direct him to result screen and show him as kicked.
         if (!localServer.RemoveDriverFromRoom(data.driver_id, true)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
      });

      socket.on('connecttodrivermodified', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         //Tell LS to stream Car camera to the Driver.
         if (!localServer.connectToDriver(data.track_id, data.driver_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
         callback({ success: true });
      });
      socket.on('watch', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         //This is a temporary function.
         //Tell LS to stream Car camera to the Driver.
         if (!localServer.watch(data.track_id, data.driver_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
         ActiveDrivers[data.driver_id].driver.status = Enum_Driver_Status.CONNECTED_TO_LOCAL_SERVER;
         ActiveDrivers[data.driver_id].driver.save();
         callback({ success: true });
      });
      socket.on('setdriverofcar', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         //Tell LS to stream Car camera to the Driver.
         if (!localServer.setDriverOfCar(data.track_id, data.driver_id, data.car_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
         callback({ success: true });
      });
      socket.on('startrecording', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         //Tell LS to stream Car camera to the Driver.
         if (!localServer.startRecording(data.track_id, data.driver_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
         callback({ success: true });
      });

      socket.on('stoprecording', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         //Tell LS to stream Car camera to the Driver.
         if (!localServer.stopRecording(data.track_id, data.driver_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
         callback({ success: true });
      });

      socket.on('streamtodrivermodified', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         //Tell LS to stream Car camera to the Driver.
         if (!localServer.streamToDriverModified(data.track_id, data.driver_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
         callback({ success: true });
      });

      socket.on('streamtodriver', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         //Tell LS to stream Car camera to the Driver.
         if (!localServer.streamToDriver(data.track_id, data.driver_id, data.car_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
      });

      socket.on('stopstream', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         //Tell LS to stop streaming to this Driver.
         if (!localServer.stopStreamToDriver(data.track_id, data.driver_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
      });

      socket.on('givecontrol', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         //Tell LS to give control of the Car to this Driver.
         if (!localServer.giveControlToDriver(data.track_id, data.driver_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
      });

      socket.on('cutcontrol', (data, callback) => {
         if (!ActiveTracks[data.track_id]) {
            callback({ success: false, reason: Enum_Callback_Reason.NO_TRACK_WITH_GIVEN_ID });
            return;
         }
         if (!localServer.isServerUp(data.track_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }

         //Tell LS to remove control of the Car of this Driver.
         if (!localServer.cutControlOfDriver(data.track_id, data.driver_id)) {
            callback({ success: false, reason: Enum_Callback_Reason.LOCAL_SERVER_IS_DOWN });
            return;
         }
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
   on_firstconnection: function (track_id) {
      //This is when LS gets its first connection from Web Server after LS restarted. If there is a room in race we need to send create race command.
      localServer.setTrackLines(track_id, [1, 2, 3, 4, 5], [6, 7, 8, 9, 1]);
   },
   on_offer: function (track_id, driverId, sdp, isleft) {
      //COMMENT OUT HERE #################################################
      //COMMENT OUT HERE #################################################
      //COMMENT OUT HERE #################################################
      // if (!(ActiveDrivers[driverId] && ActiveDrivers[driverId].socket && ActiveDrivers[driverId].driver.status == Enum_Driver_Status.ONLINE)) {
      //       localServer.disconnectDriver(driverId);
      //       return;
      // }
      ActiveDrivers[driverId].socket.emit("offer", { track_id, sdp, isleft });
   },
   on_webrtcup: function (track_id, driverId) {
      //Check if driver is in a room and room has a status IN_RACE, if so, connect him to the car
      if (!ActiveDrivers[driverId]) {
         localServer.disconnectDriver(track_id, driverId);
         return;
      }

      var driver = ActiveDrivers[driverId].driver;
      var socket = ActiveDrivers[driverId].socket;
      var room = ActiveDrivers[driverId].room;

      if (!room || !ActiveRooms[room.uuid] || !ActiveRooms[room.uuid].drivers[driverId]) {
         ActiveDrivers[driverId].room = null;
         localServer.disconnectDriver(track_id, driverId);
         return;
      }

      //Room is closed already or hasnt been to a race yet. So cut the Webrtc connection and change status of the driver.
      if (room.status == Enum_Room_Status.CREATING ||
         room.status == Enum_Room_Status.CLOSED ||
         room.status == Enum_Room_Status.IN_QUEUE ||
         room.status == Enum_Room_Status.IN_QUEUE_READY) {
         //This is unlikely but may happen.
         localServer.disconnectDriver(track_id, driverId);
         return;
      } else {
         //If controlled and streamed car ids exist and equal, start stream and control to that car
         if (room.race.driver_cars[driverId].controlled_car_id && room.race.driver_cars[driverId].streamed_car_id && room.race.driver_cars[driverId].controlled_car_id == room.race.driver_cars[driverId].streamed_car_id) {
            localServer.startStreamAndControl(track_id, driverId, room.race.driver_cars[driverId].controlled_car_id);
         } else {
            //both controlled car id and streamed car id may exist but be different
            //if controlled car id exist, start control to that car
            if (room.race.driver_cars[driverId].controlled_car_id) {
               localServer.giveControlToDriver(track_id, driverId, room.race.driver_cars[driverId].controlled_car_id);
            }
            //if streamed car id exist, start stream to that car
            if (room.race.driver_cars[driverId].streamed_car_id) {
               localServer.streamToDriver(track_id, driverId, room.race.driver_cars[driverId].streamed_car_id);
            }
         }
      }
      driver.status = Enum_Driver_Status.CONNECTED_TO_LOCAL_SERVER;
      socket.join(room.uuid);
   },
   on_hangup: function (track_id, driverId) {
      //Driver got disconnected from Local Server. If driver is still connected to Web Server, we should try to connect him to LS again.
      //If driver also disconnected from here, we will just wait him to come again. If he doesnt come, timeout in onDisconnect() will remove him from the room.
   },
   on_carconnected: function (track_id, carName) {
      Car.findOne({ name: carName }, function (err, car) {
         if (err) {
            console.log("Error retriving car from DB. -> " + err);
            return;
         }
         if (car) {
            //TODO: Notify Admins
            ActiveCars[car.uuid] = ActiveCars[car.uuid] || {};
            ActiveCars[car.uuid].name = carName;
            ActiveCars[car.uuid].track_id = track_id;
            ActiveCars[car.uuid].status = "online";
         }
      });

   },
   on_cardisconnected: function (track_id, carId) {
      //TODO: Notify Admins
      if (ActiveCars[carId])
         ActiveCars[carId].status = "offline";
   },
   on_car_lap: function (track_id, carId) {
      //TODO: Notify Admins

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
      chat: [],
      race: room.race ? {
         uuid: room.race.uuid,
         ranking: room.race.ranking
      } : null
   };
   for (var c = 0; c < room.chat.length; c++) {
      model.chat.push(room.chat[c]);
   }
   for (var driver_uuid in room.drivers) {
      if (ActiveDrivers[driver_uuid] && ActiveDrivers[driver_uuid].driver) {
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
      driver_count: { offline: 0, not_ready: 0, ready: 0 },
      is_locked: room.password != null && room.password != "",
      create_date: room.create_date
   };
   var offline = 0;
   var not_ready = 0;
   var ready = 0;
   for (var driver in room.drivers) {
      if (room.drivers[driver].status == Enum_Driver_Room_Status.OFFLINE)
         model.driver_count.offline++;
      else if (room.drivers[driver].status == Enum_Driver_Room_Status.NOT_READY)
         model.driver_count.not_ready++;
      else if (room.drivers[driver].status == Enum_Driver_Room_Status.READY)
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
   if (!ActiveDrivers[driver.uuid]) {
      status = Enum_Driver_Room_Status.OFFLINE;
   } else if (ActiveDrivers[driver.uuid].room && ActiveDrivers[driver.uuid].room.drivers[driver.uuid]) {
      status = ActiveDrivers[driver.uuid].room.drivers[driver.uuid].status;
   } else {
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
