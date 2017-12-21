
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
const SnapshotRooms = {}; //Keep same room objects in Snapshot with their room uuids to reach easily.
/*
Snapshot: 
{
   uuid: "trackid1",
   name: "",
   rooms: [
      {
         uuid: "",
         name: "",
         status: 0,
         driver_count: 3,
         is_locked: 0,
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
   JOINING_ROOM: 2,
   IN_ROOM: 3
};

const Enum_Room_Status = {
   CREATING: 0,
   IN_QUEUE: 1,
   IN_QUEUE_READY: 2,
   IN_PRE_RACE: 3,
   IN_RACE: 4,
   IN_RACE_RESULT: 5,
   CLOSED: 6 //if Race is null, then room is closed while in the queue
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
   ROOM_IS_FULL: 7
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

      //TODO: Take all necessary info to variables(ActiveRooms, ActiveDriver, Snapshot etc) then start socketio server.
      Track.find({}, function (err, tracks) {
         if (err) {
            console.log("Error while getting Tracks from DB.-> " + err);
            return;
         }
         for (var t = 0; t < tracks.length; t++) {
            Tracks[tracks[t].uuid] = tracks[t];
            Snapshot[tracks[t].uuid] = {
               name: tracks[t].name,
               rooms: []
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
                  var snapshotRoom = {
                     name: rooms[r].name,
                     status: rooms[r].status,
                     driver_count: Object.keys(rooms[r].drivers).length,
                     is_locked: rooms[r].password == null ? false : true
                  };
                  SnapshotRooms[rooms[r].uuid] = snapshotRoom;
                  Snapshot[rooms[r].track_id].rooms.push(snapshotRoom);
                  for (var uuid in rooms[r].drivers) {
                     ActiveDrivers[uuid] = { room: rooms[r] };
                     Driver.findOne({ uuid }, function (err, driver) {
                        if (err) {
                           console.log("Error retriving driver from DB. -> " + err);
                           return;
                        }
                        if (driver) {
                           ActiveDrivers[driver.uuid].driver = driver;
                        }
                     });
                  }
               }
            });
         }
      });
      setTimeout(() => {
         //Wait for drivers in the rooms to get online. If they are not online after a while, remove them from both room and ActiveDrivers.
         for (var driverUuid in ActiveDrivers) {
            if (!ActiveDrivers[driverUuid].socket) {
               delete ActiveRooms[ActiveDrivers[driverUuid].room.uuid].drivers[driverUuid];
               delete ActiveDrivers[driverUuid];
            }
         }
      }, 20000);


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
         //{track_id, chat}
         //Emit to everyone
         io.emit("global-chat", data);
      });

      socket.on('room-chat', data => {
         //Emit to room if roomId exist
         if (socket.driver && ActiveDrivers[socket.driver.uuid].room)
            io.to(ActiveDrivers[socket.driver.uuid].room.uuid).emit('room-chat', data);
      });

      socket.on('answer', (data, callback) => {
         if (!socket.driver || !data.sdp)
            return;
         localServer.sendAnswerSdp(socket.driver.uuid, data.sdp);
      });

      socket.on('candidate', (data, callback) => {
         if (!socket.driver || !data.candidate)
            return;
         localServer.sendCandidate(socket.driver.uuid, data.candidate);
      });

      socket.on('register', (data, callback) => {
         //check if all info given
         if (!(data.username && data.email && data.password)) {
            callback({ success: false, reason: Enum_Callback_Reason.MISSING_INFO }); //"One of the info is missing!"
            return;
         }

         //TODO: Check if there is another user with this username or email address. If so, return false.

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
               callback({ success: true, driver: DriverViewModel(driver), token: getToken(DriverViewModel(driver), 60 * 60 * 24) });
            }
         });
      });

      function onDisconnect(driver) {
         driver.status = Enum_Driver_Status.OFFLINE;
         driver.save();
         if (ActiveDrivers[driver.uuid].room) {
            //Remove driver from socket.io room too
            ActiveDrivers[driver.uuid].socket.leave(ActiveDrivers[driver.uuid].room.uuid);
            //let others in the room know this driver got offline
            io.to(ActiveDrivers[driver.uuid].room.uuid).emit('update', { type: "offline", driver_id: driver.uuid });
            if (ActiveDrivers[driver.uuid].room.status == Enum_Room_Status.IN_QUEUE) {
               var timeoutId = setTimeout(function () {
                  console.log("Waited enough for the Driver. Removing from room and ActiveDrivers.");
                  var room = ActiveDrivers[driver.uuid].room;
                  //remove driver from the room
                  if (room.drivers[driver.uuid]) {
                     //TODO: If this player is the admin of the room, set second driver as new admin and let drivers in the room know that.
                     delete room.drivers[driver.uuid];
                     room.save();
                     localServer.disconnectDriver(driver.uuid);
                     //let others in the room know this driver left the room
                     io.to(room.uuid).emit('update', { type: "leave", driver_id: driver.uuid });
                     delete ActiveDrivers[driver.uuid];
                     delete DriverTimeouts[driver.uuid];
                     //TODO: Also let everyone know about this room update
                  }
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
         //Check if driver was in a room and disconnected. If so, connect him to the room.
         if (ActiveDrivers[driver.uuid]) {
            if (ActiveDrivers[driver.uuid].room && ActiveRooms[ActiveDrivers[driver.uuid].room.uuid]) {
               driver.status = Enum_Driver_Status.JOINING_ROOM;
               driver.save();
               localServer.connectToDriver(driver.uuid);
            } else {
               ActiveDrivers[driver.uuid].room = null;
            }
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
         return getToken(DriverViewModel(driver), 60 * 60 * 24);
      }

      socket.on('authenticate', (data, callback) => {
         //check if all info given (username&&password or token)
         if (data.token) {
            Jwt.verify(data.token, process.env.SECRET_KEY, function (err, driver) {
               if (err || !driver) {
                  callback({ success: false, reason: Enum_Callback_Reason.TOKEN_EXPIRED, error: err }); //"Jwt error"
                  return;
               }
               //Check if this driver id has a info in ActiveDrivers. If so, dont allow him to login from here.
               console.log(ActiveDrivers);
               if (ActiveDrivers[driver.uuid] && ActiveDrivers[driver.uuid].socket) {
                  callback({ success: false, reason: Enum_Callback_Reason.ALREADY_LOGGED_IN }); //"Already logged in from another tab."
                  return;
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
                  callback({ success: true, driver: DriverViewModel(d), token: logDriverIn(d, socket) });
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
               callback({ success: true, driver: DriverViewModel(driver), token: logDriverIn(driver, socket) });
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
         var room = ActiveDrivers[socket.driver.uuid].room;
         if (room && room.drivers[socket.driver.uuid]) {
            //TODO: If this player is the admin of the room, set second driver as new admin and let drivers in the room know that.
            delete room.drivers[socket.driver];
            room.save();
            localServer.disconnectDriver(driverId);
         }
         delete ActiveDrivers[socket.driver.uuid];
         delete socket.driver;
         callback({ success: true });
      });

      socket.on('create-room', (data, callback) => {
         //Check if he is logged in
         if (!socket.driver) {
            callback({ success: false, reason: Enum_Callback_Reason.NOT_LOGGED_IN }); //"Socket.driver is NULL."
            return;
         }
         //Check if track_id and room_name exist
         if (!data.track_id || !data.room_name) {
            callback({ success: false, reason: Enum_Callback_Reason.MISSING_INFO }); //"track_id or room_name is missing."
            return;
         }

         //TODO: Check if a track with track_id exist

         var driver = socket.driver;

         //Check if driver has enough money to join the race.
         if (driver.coin >= COIN_PER_RACE) {
            //Check If driver is in another room already. if so, first get him out of that room by changing the driver_room_status.
            if (ActiveDrivers[driver.uuid].room) {
               var room = ActiveDrivers[driver.uuid].room;
               //remove driver from the room
               if (room.drivers[driverId]) {
                  //TODO: If this player is the admin of the room, set second driver as new admin and let drivers in the room know that.
                  delete room.drivers[driverId];
                  delete ActiveDrivers[driver.uuid].room;
                  localServer.stopStreamAndControl(driverId);
                  room.save();
                  break;
               }
               //let others in the room know this driver left the room
               io.to(room.uuid).emit('update', { type: "leave", driver_id: driver.uuid });
               //Remove driver from socket.io room too
               ActiveDrivers[driver.uuid].socket.leave(room.uuid);
               //TODO: Also let everyone know about this room update
            }

            //Create a room and driver with status CONNECTING
            var newRoom = new Room({
               _id: new Mongoose.Types.ObjectId(),
               uuid: uuidv4(),
               status: Enum_Room_Status.CREATING,
               create_date: Date.now(),
               admin_id: driver.uuid,
               race: null,
               name: data.room_name,
               track_id: data.track_id,
               drivers: {}
            });
            newRoom.drivers[driver.uuid] = { controlled_car_id: null, streamed_car_id: null };
            newRoom.save(function (err, room) {
               if (err || !room) {
                  console.log("Couldnt save new Room to DB! -> ", err);
                  callback({ success: false, reason: Enum_Callback_Reason.DB_ERROR, error: err });
                  return;
               }
               ActiveRooms[room.uuid] = room;
               ActiveDrivers[driver.uuid].room = room;
               ActiveDrivers[driver.uuid].socket.join(room.uuid);
               ActiveDrivers[driver.uuid].driver.status = Enum_Driver_Status.JOINING_ROOM;
               ActiveDrivers[driver.uuid].driver.save();
               //Ask local-server to connect to this driver and wait for the webrtcup message
               localServer.connectToDriver(driver.uuid);
               //when you get webrtcup message, create a new room (in both DB and socket.io) and add the driver to the room.
               callback({ success: true, reason: "Room is created! Uuid id: " + room.uuid });
            });
         } else {
            callback({ success: false, reason: Enum_Callback_Reason.NOT_ENOUGH_COIN });
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

         //TODO: Check if the room is full already.

         //Check if driver has enough money to join the race.
         if (driver.coin >= COIN_PER_RACE) {
            //Check If driver is in another room already. if so, first get him out of that room by changing the driver_room_status.
            if (ActiveDrivers[driver.uuid].room) {
               var room = ActiveDrivers[driver.uuid].room;
               //remove driver from the room
               if (room.drivers[driver.uuid]) {
                  //TODO: If this player is the admin of the room, set second driver as new admin and let drivers in the room know that.
                  delete room.drivers[driver.uuid];
                  delete ActiveDrivers[driver.uuid].room;
                  localServer.stopStreamAndControl(driver.uuid);
                  room.save();

                  //let others in the room know this driver left the room
                  io.to(room.uuid).emit('update', { type: "leave", driver_id: driver.uuid });
                  //Remove driver from socket.io room too
                  socket.leave(room.uuid);
                  //TODO: Also let everyone know about this room update
                  ActiveDrivers[driver.uuid].room = null;
               }
               delete ActiveDrivers[driver.uuid].room;
            }

            //Find the room and add the driver
            if (ActiveRooms[data.room_id]) {
               var room = ActiveRooms[data.room_id];
               room.drivers[driver.uuid] = { controlled_car_id: null, streamed_car_id: null };
               room.save(function (err, updatedRoom) {
                  if (updatedRoom) {
                     ActiveRooms[updatedRoom.uuid] = updatedRoom;
                     ActiveDrivers[driver.uuid].room = updatedRoom;
                     ActiveDrivers[driver.uuid].driver.status = Enum_Driver_Status.JOINING_ROOM;
                     ActiveDrivers[driver.uuid].driver.save();
                     //Ask local-server to connect to this driver and wait for the webrtcup message
                     localServer.connectToDriver(driver.uuid);
                     socket.join(updatedRoom.uuid);
                     //when you get webrtcup message, create a new room (in both DB and socket.io) and add the driver to the room. 
                     callback({ success: true, reason: "Joined the room!" });
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
                  callback({ success: true, token: getToken({ uuid: a.uuid, username: a.username }) });
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
               callback({ success: true, token: getToken({ uuid: admin.uuid, username: admin.username }) });
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

      socket.on('getsnapshot', (data, callback) => {
         //Send Tracks, Rooms and Drivers.
         socket.emit("snapshot", Snapshot);
      });

      socket.on('startrace', (data, callback) => {
         //TODO: Send start race command to LS.

      });

      socket.on('pauserace', (data, callback) => {
         //TODO: Send pause race command to LS.

      });

      socket.on('resumerace', (data, callback) => {
         //TODO: Send resume race command to LS.

      });

      socket.on('abortrace', (data, callback) => {
         //TODO: Send abort race command to LS.

      });

      socket.on('takenextroomin', (data, callback) => {
         //TODO: If the current room is still in race, disconnect them from LS and show result screen.
         //Take next room to the game waiting screen.

      });

      socket.on('controlcar', (data, callback) => {
         //TODO: Send control command LS.

      });

      socket.on('removedriver', (data, callback) => {
         //TODO: Remove Driver from the room and disconnect from LS. Direct him to result screen and show him as kicked.

      });

      socket.on('streamtodriver', (data, callback) => {
         //TODO: Tell LS to stream Car camera to the Driver.

      });

      socket.on('stopstream', (data, callback) => {
         //TODO: Tell LS to stop streaming to this Driver.

      });

      socket.on('givecontrol', (data, callback) => {
         //TODO: Tell LS to give control of the Car to this Driver.

      });

      socket.on('cutcontrol', (data, callback) => {
         //TODO: Tell LS to remove control of the Car of this Driver.

      });

      socket.on('movecartotrack', (data, callback) => {
         //TODO: Move Car to another track. Set in DB.

      });

   });

};

function getToken(data, expiresIn) {
   var token = Jwt.sign(data, process.env.SECRET_KEY, {
      expiresIn: expiresIn || (60 * 60 * 24) //in seconds
   });
   return token;
}


var localServerCallbacks = {
   on_offer: function (driverId, sdp) {
      if (!(ActiveDrivers[driverId] && ActiveDrivers[driverId].socket && ActiveDrivers[driverId].driver.status == Enum_Driver_Status.JOINING_ROOM)) {
         localServer.disconnectDriver(driverId);
         return;
      }
      ActiveDrivers[driverId].socket.emit("offer", { sdp: sdp });
   },
   on_webrctup: function (driverId) {
      //Nothing to do here for now. We will wait for Driver to verify his ID.
   },
   on_verified: function (driverId) {

      //Driver verified his ID with LS. Add this driver to the room.
      //Change driver's status in the room drivers list and add driver to the socket.io room

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
            localServer.disconnectDriver(driverId);
            driver.status = Enum_Driver_Status.ONLINE;
            driver.save();
            delete room.drivers[driverId];
            delete ActiveDrivers[driverId].room;
            return;
         }
         driver.status = Enum_Driver_Status.IN_ROOM;
         driver.save();
         socket.join(room.uuid);
         return;
      }

   },
   on_hangup: function (driverId) {
      //Driver got disconnected from Local Server. If driver is still connected to Web Server, we should try to connect him to LS again.
      //If driver also disconnected from here, we will just wait him to come again. If he doesnt come, timeout in onDisconnect() will remove him from the room.
   },
   on_wrongid: function (driverId) {
      //Driver somehow gave the wrong id to Local Server and LS cut the webrtc connection.
      //Remove Driver from the room that he wanted to join. And let everyone know this.
      if (!ActiveDrivers[driverId]) {
         //Probably a malicious attack happened.
         console.log("Malicious attack might have happened. DriverId: " + driverId);
         return;
      }

      var driver = ActiveDrivers[driverId].driver;
      var socket = ActiveDrivers[driverId].socket;
      var room = ActiveDrivers[driverId].room;

      driver.status = Enum_Driver_Status.ONLINE;
      driver.save();

      if (room && room.drivers[driverId]) {
         if(room.admin_id == driverId){
            //TODO: If this player was the admin of the room, set second driver as new admin and let drivers in the room know that.
         }
         delete room.drivers[driverId];
         room.save();
      }
      socket.disconnect();
      delete socket.driver;
      delete ActiveDrivers[driverId];
   },
   on_carconnected: function () {
      //TODO: Notify Admins
   },
   on_cardisconnected: function () {
      //TODO: Notify Admins
   }
};

var DriverViewModel = function (driver) {
   return {
      uuid: driver.uuid,
      username: driver.username,
      email: driver.email,
      coin: driver.coin,
      xp: driver.xp,
      bronze_medal: driver.bronze_medal,
      silver_medal: driver.silver_medal,
      gold_medal: driver.gold_medal
   };
};
