"use strict";

var Guid = require('guid');
var Jwt = require("jsonwebtoken");
var Mongoose = require("mongoose");

//Custom Modules
var localServer = require('./local-server');

//Models
var Car = require("../models/Car");
var Driver = require("../models/Driver");
var Room = require("../models/Room");

/*

Her gelene pistleri(kamera linkleri, pist resimleri, adi vb) ve pistlerdeki oda bilgilerini gonder. Bunlar update edildikce emit et.

Uye girisi yapmis kisilerden Oda yaratma ve Odaya katilma isteklerini kabul et.

Ayni odada olan kisilerin chat gonderilerini birbirlerine gonder. Bunun icin Sokcetio nun oda kurma ozelligini kullan.

Odaya girmek isteyen kisinin yeterli parasi olup olmadigini kontrol et. Eger yoksa odaya alma.

Odaya girmek isteyen kisiyle WebRTC baglantisi kur. Baglanti kuruldu onayi alinca kisiyi odaya al. O zaman araliginda odada bir kisilik yer ayir ki baskasi girmesin.

Yarisa girerken herkesten gerekli miktarda para dus. Parasi yetmeyeni odadan gonder.

Uye girisi yapmis bir kisinin baska bir browserdan giris yapmasini engelle. Whatsapp gibi calis. Bu sekmeden devam et secenegi cikar.

Oda bilgilerini DB'de tut. Bir kullanici odada iken cikis yaparsa geri geldiginde ayni odada devam edebilsin.

Gelen genel chat mesajlarini uye olsun olmasin herkese gonder.

*/

const ActiveRooms = {}; //Put rooms by room ids
const ActiveDrivers = {}; //{ driver, socket, room } by driver.guid_id
const DriverTimeouts = {}; //Put timeouts by driver id. When a driver disconnect while he is in a room in queue, create a timeout and keep it here. If he connects back before timeout, stop this timeout.


const COIN_PER_RACE = 1;
const MAX_ROOM_CAPACITY = 4;
process.env.SECRET_KEY = "*/THISISSECRET/*";

const Enum_Driver_Status = {
   DEFAULT: 0,
   JOINING_ROOM: 1,
   IN_ROOM: 2
};

//Driver status in a room
const Enum_Driver_Room_Status = {
   CONNECTING: 0,
   READY: 1,
   LEFT: 2,
   DISCONNECTED: 3
};

const Enum_Room_Status = {
   CREATING: 0,
   IN_QUEUE: 1,
   IN_PRE_RACE: 2,
   IN_RACE: 2,
   IN_RACE_RESULT: 3,
   CLOSED: 4 //if Race is null, then room is closed while in the queue
};



//DB user pass: tracerwebserver**
//Connection URL
const url = 'mongodb://tracer_web_server:tracerwebserver**@ds123796.mlab.com:23796/tracerdb';
//const url = 'mongodb://localhost:27017/tracerDB';
Mongoose.connect(url);
var db = Mongoose.connection;

db.once("open", function () {
   console.log("Mongoose connected to DB server");
});

db.on("error", function (err) {
   throw err;
});

// var db = null;
// // Use connect method to connect to the Server
// MongoClient.connect(url, function (err, _db) {
//    assert.equal(null, err);
//    console.log("Connected to DB server");
//    db = _db;
// });

var io = null;
module.exports = {
   start: function (httpServer) {
      localServer.start(localServerCallbacks);

      io = require('socket.io').listen(httpServer);
      io.sockets.on('connection', socket => {
         //TODO: Send Room List 

         socket.on('disconnect', function () {
            console.log('Got disconnect!');
            //If driver was in a room 1) if room was in queue: start a timeout. When time out, remove driver form the room.
            //2) If room was locked and started race, wait driver to connect again. So do not do anything here. Just set driver_room_status.
            onDisconnect(socket.driver);
         });

         socket.on('global-chat', data => {
            //Emit to everyone
            io.emit("global-chat", data);
         });

         socket.on('room-chat', data => {
            //Emit to room if roomId exist
            if (socket.roomId)
               io.to(socket.roomId).emit('chat', data);
         });

         socket.on('register', (data, callback) => {
            //check if all info given
            if (!(data.username && data.email && data.password)) {
               callback({ success: false });
               return;
            }

            //create new driver in DB
            let driver = new Driver({
               guid_id: Guid.raw(),
               username: data.username,
               email: data.email,
               password: data.password,
               coin: 0,
               xp: 0,
               bronze_medal: 0,
               silver_medal: 0,
               gold_medal: 0,
               register_date: Date.now(),
               last_login: Date.now(),
               status: Enum_Driver_Status.DEFAULT,
               room: null,
               car: null
            });
            driver.save(function (err) {
               if (err) {
                  callback({ success: false });
                  return;
               } else {
                  //keep the socket by its driver id to access it when a message comes from the local server
                  ActiveDrivers[driver.guid_id] = { driver: driver, socket: socket };
                  var token = Jwt.sign(driver, process.env.SECRET_KEY, {
                     expiresIn: 60 * 60 * 24 //in seconds
                  });
                  //send driver info back
                  callback({ success: true, driver: DriverViewModel(driver), token: token });
               }
            });
         });

         function onDisconnect(driver) {
            driver.status = Enum_Driver_Status.DEFAULT;
            if(ActiveDrivers[driver].room && ActiveDrivers[driver].room.status == Enum_Room_Status.IN_QUEUE){
               var timeoutId = setTimeout(function () {
                  var room = ActiveDrivers[driver].room;
                  //remove driver from the room
                  for (var d = 0; d <= room.drivers.lenght; d++) {
                     if (room.drivers[d].driver_id == driverId) {
                        room.drivers[d].status = Enum_Driver_Room_Status.LEFT;
                        room.drivers[d].controlled_car_id = null;
                        room.drivers[d].streamed_car_id = null;
                        room.save();
                        localServer.disconnectDriver(driver.guid_id);
                        //let others in the room know this driver left the room
                        io.to(room.guid_id).emit('update', { type: "leave", driver_id: driver.guid_id });
                        //Remove driver from socket.io room too
                        ActiveDrivers[driver].socket.leave(room.guid_id);
                        delete ActiveDrivers[driver.guid_id];
                        delete DriverTimeouts[driverId];
                        //TODO: Also let everyone know about this room update
                        break;
                     }
                  }
               }, 20000);
               DriverTimeouts[driverId] = timeoutId;
            }
            ActiveDrivers[driver].socket.disconnect();
         }

         function logDriverIn(driver, _socket) {
            //Stop timer if exist
            if(DriverTimeouts[driver.guid_id]){
               clearTimeout(DriverTimeouts[driver.guid_id]);
               delete DriverTimeouts[driver.guid_id];
            }
            //Check if driver was in a room and disconnected. If so, connect him to the room.
            if (ActiveDrivers[driver.guid_id]) {
               if (ActiveDrivers[driver.guid_id].room && ActiveRooms[ActiveDrivers[driver.guid_id].room.guid_id]) {
                  var room = ActiveDrivers[driver.guid_id].room;
                  for (var d = 0; d <= room.drivers.lenght; r++) {
                     if (room.drivers[d].driver_id == driver.guid_id) {
                        room.drivers[d].status = Enum_Driver_Room_Status.CONNECTING;
                        room.save();
                     }
                  }
                  //use below if the save above does not work
                  /* Room.findById(driver.room.guid_id, function(err, room){
                     if(room){
                        for(var d=0;d<=room.drivers.lenght;d++){
                           if(room.drivers[d].driver_id == driver.guid_id){
                              room.drivers[d].status = Enum_Driver_Room_Status.CONNECTING;
                              room.save();
                              break;
                           }
                        }
                     }
                  }); */
                  //db.collection("rooms").update({ _id: driver.room_id, "drivers.driver_id": driver.guid_id },{ $set:{'drivers.$.status': Enum_Driver_Room_Status.CONNECTING}});
                  //db.collection("drivers").update({ _id: driver.guid_id },{ $set:{status: Enum_Driver_Status.JOINING_ROOM}});
                  driver.status = Enum_Driver_Status.JOINING_ROOM;
                  driver.save();
                  localServer.connectToDriver(driver.guid_id);
               }
            }
            //keep driver info on the socket
            _socket.driver = driver;
            //keep the socket by its driver id to access it when a message comes from the local server
            ActiveDrivers[driver.guid_id].socket = _socket;
            driver.last_login = Date.now();
            driver.save();
            //db.collection("drivers").updateOne({ _id: driver.guid_id },{ $set:{ last_login: driver.last_login, status: driver.status }});
            //Create new token with expiration date
            var token = Jwt.sign(driver, process.env.SECRET_KEY, {
               expiresIn: 60 * 60 * 24 //in seconds
            });
            return token;
         }

         socket.on('authenticate', data => {
            //check if all info given (username&&password or token)
            if (data.token) {
               Jwt.verify(token, process.env.SECRET_KEY, function (err, driver) {
                  if (err || !driver) {
                     callback({ success: false });
                     return;
                  }
                  //Check if this driver id has a info in ActiveDrivers. If so, dont allow him to login from here.
                  if (ActiveDrivers[driver.guid_id]) {
                     callback({ success: false });
                     return;
                  }

                  //send driver info back
                  callback({ success: true, driver: DriverViewModel(driver), token: logDriverIn(driver, socket) });
               });
            } else if (data.username && data.password) {
               //Check username and password from DB                
               if (!db) {
                  callback({ success: false });
                  return;
               }
               Driver.findOne({ username: data.username, password: data.password }, function (err, driver) {
                  if (err || !driver) {
                     callback({ success: false });
                     return;
                  } else {
                     //Check if this driver id has a socket in DriverSockets. If so, dont allow him to login from here.
                     if (ActiveDrivers[driver.guid_id]) {
                        callback({ success: false });
                        return;
                     }

                     //send driver info back
                     callback({ success: true, driver: DriverViewModel(driver), token: logDriverIn(driver, socket) });
                     return;
                  }
               });
            } else {
               callback({ success: false });
               return;
            }
         });

         socket.on('logout', data => {
            //TODO: If driver is in a room, take him out. And disconnect the socket.
            var room = ActiveDrivers[socket.driver.guid_id];
            if(room){
               //TODO: Use this; room.drivers[driverId] = { status, controlled_car_id, streamed_car_id }
            }
            onDisconnect(socket.driver);
            delete socket.driver;
         });

         socket.on('create-room', (data, callback) => {
            //Check if he is logged in
            if (!socket.driver) {
               callback({ success: false }); //TODO: Add reason
               return;
            }
            //TODO: Check if track_id and room_name exist
            //TODO: Check if a track with track_id exist

            //Check if driver has enough money to join the race.
            if (driver.coin >= COIN_PER_RACE) {
               //Check If driver is in another room already. if so, first get him out of that room by changing the driver_room_status.
               if(ActiveDrivers[driver.guid_id].room){
                  var room = ActiveDrivers[driver.guid_id].room;
                  //change driver room status to remove him from the room
                  for (var d = 0; d <= room.drivers.lenght; d++) {
                     if (room.drivers[d].driver_id == driverId) {
                        room.drivers[d].status = Enum_Driver_Room_Status.LEFT;
                        localServer.stopStreamAndControl(driverId);
                        room.drivers[d].controlled_car_id = null;
                        room.drivers[d].streamed_car_id = null;
                        room.save();
                        break;
                     }
                  }
                  //let others in the room know this driver left the room
                  io.to(room.guid_id).emit('update', { type: "leave", driver_id: driver.guid_id });
                  //Remove driver from socket.io room too
                  ActiveDrivers[driver.guid_id].socket.leave(room.guid_id);
                  //TODO: Also let everyone know about this room update
               }

               //Create a room and driver with status CONNECTING
               var newRoom = new Room({
                  guid_id: Guid.raw(),
                  status: Enum_Room_Status.CREATING,
                  create_date: Date.now(),
                  admin_id: driver._id,
                  race: null,
                  name: data.room_name,
                  track_id: data.track_id,
                  drivers: [{ driver_id: driver.guid_id, status: Enum_Driver_Room_Status.CONNECTING, controlled_car_id: null, streamed_car_id: null }]
               });
               newRoom.save(function (err, room) {
                  ActiveRooms[room.guid_id] = room;
                  ActiveDrivers[driver.guid_id].socket.join(room.guid_id);
                  //Ask local-server to connect to this driver and wait for the webrtcup message
                  localServer.connectToDriver(driver.guid_id);
                  //when you get webrtcup message, create a new room (in both DB and socket.io) and add the driver to the room.
               });

               // db.collection("rooms").insertOne(newRoom, function (err, room) {
               //    driver.room_id = room.guid_id;
               //    ActiveRooms[newRoom.guid_id] = newRoom;
               //    //Ask local-server to connect to this driver and wait for the webrtcup message
               //    localServer.connectToDriver(driver.guid_id);
               //    //when you get webrtcup message, create a new room (in both DB and socket.io) and add the driver to the room.
               // });
               
            }
         });

         socket.on('join-room', (data, callback) => {
            //Check if he is logged in
            if (!socket.driver) {
               callback({ success: false }); //TODO: Add reason
               return;
            }
            //TODO: Check if track_id and room_name exist
            //TODO: Check if a track with track_id exist

            //Check if driver has enough money to join the race.
            if (driver.coin >= COIN_PER_RACE) {
              //Check If driver is in another room already. if so, first get him out of that room by changing the driver_room_status.
               if(ActiveDrivers[driver.guid_id].room){
                  var room = ActiveDrivers[driver.guid_id].room;
                  //change driver room status to remove him from the room
                  for (var d = 0; d <= room.drivers.lenght; d++) {
                     if (room.drivers[d].driver_id == driverId) {
                        room.drivers[d].status = Enum_Driver_Room_Status.LEFT;
                        localServer.stopStreamAndControl(driverId);
                        room.drivers[d].controlled_car_id = null;
                        room.drivers[d].streamed_car_id = null;
                        room.save();
                        break;
                     }
                  }
                  //let others in the room know this driver left the room
                  io.to(room.guid_id).emit('update', { type: "leave", driver_id: driver.guid_id });
                  //Remove driver from socket.io room too
                  ActiveDrivers[driver.guid_id].socket.leave(room.guid_id);
                  //TODO: Also let everyone know about this room update
                  ActiveDrivers[driver.guid_id].room = null;
               }

               //Find the room and add the driver
               if(ActiveRooms[data.room_id]){
                  var room = ActiveRooms[data.room_id];
                  room.drivers.push({driver_id: driver._id, status: Enum_Driver_Room_Status.CONNECTING, controlled_car_id: null, streamed_car_id: null})
                  room.save(function(err, updatedRoom){
                     if(updatedRoom){
                        ActiveRooms[updatedRoom.guid_id] = updatedRoom;
                        ActiveDrivers[driver.guid_id].room = updatedRoom;
                        //Ask local-server to connect to this driver and wait for the webrtcup message
                        localServer.connectToDriver(driver.guid_id);
                        //when you get webrtcup message, create a new room (in both DB and socket.io) and add the driver to the room.   
                     }else{
                        console.log("Could NOT update the room and add the driver.");
                     }
                  });
               }

            }
         });

      });
   }
};

var localServerCallbacks = {
   on_offer: function (driverId, offerSdp) {
      var socket = ActiveDrivers[driverId].socket;
      if (socket) {
         socket.emit("offer", { sdp: offerSdp });
      } else {
         localServer.disconnectDriver(driverId);
      }
   },
   on_webrtcup: function (driverId) {

      //Got webrtcup message. Add this driver to the room.
      //Change driver's status in the room drivers list and add driver to the socket.io room

      //Check if driver is in a room and room has a status IN_RACE, if so, connect him to the car
      if(!ActiveDrivers[driverId]){
         localServer.disconnectDriver(driverId);
         return;
      }

      var driver = ActiveDrivers[driverId].driver;
      var socket = ActiveDrivers[driverId].socket;
      var room = ActiveDrivers[driverId].room;

      if(!room){
         localServer.disconnectDriver(driverId);
         driver.status = Enum_Driver_Status.DEFAULT;
         driver.save();
         return;
      }

      for (var d = 0; d <= room.drivers.lenght; d++) {
         if (room.drivers[d].guid_id == driverId) {
            //Only if the room is in Race, check if there is controlled and streamed car ids
            if (room.status == Enum_Room_Status.IN_QUEUE) {
               room.drivers[d].status = Enum_Driver_Room_Status.READY;
               room.save();
            }else if (room.status == Enum_Room_Status.IN_RACE) {
               //If controlled and streamed car ids exist and equal, start stream and control to that car
               if (room.drivers[d].controlled_car_id && room.drivers[d].streamed_car_id && room.drivers[d].controlled_car_id == room.drivers[d].streamed_car_id) {
                  localServer.startStreamAndControl(driverId, room.drivers[d].controlled_car_id);
               } else {
                  //both controlled car id and streamed car id may exist but be different
                  //if controlled car id exist, start control to that car
                  if (room.drivers[d].controlled_car_id) {
                     localServer.giveControlToDriver(driverId, room.drivers[d].controlled_car_id);
                  }
                  //if streamed car id exist, start stream to that car
                  if (room.drivers[d].streamed_car_id) {
                     localServer.streamToDriver(driverId, room.drivers[d].streamed_car_id);
                  }
               }
            }
            //If Room is closed, driver do not need to be here anymore
            else if (room.status == Enum_Room_Status.CLOSED) {
               //This is unlikely but may happen.
               //Room is closed already. So cut the Webrtc connection and change status of the driver.
               localServer.disconnectDriver(driverId);
               driver.status = Enum_Driver_Status.DEFAULT;
               driver.save();
               return;
            }
            driver.status = Enum_Driver_Status.IN_ROOM;
            driver.save();
            socket.join(room.guid_id);
            return;
         }
      }
   },
   on_disconnect: function (driverId) {
      //Driver got disconnected from Local Server.
   },
   on_wrongid: function (driverId) {
      //Driver somehow gave the wrong id to Local Server and LS cut the webrtc connection.
      //Remove Driver from the room that he wanted to join. And let everyone know this.
   }
};

var DriverViewModel = function (driver) {
   return {
      guid_id: driver.guid_id,
      username: driver.username,
      email: driver.email,
      coin: driver.coin,
      xp: driver.xp,
      bronze_medal: driver.bronze_medal,
      silver_medal: driver.silver_medal,
      gold_medal: driver.gold_medal
   };
};