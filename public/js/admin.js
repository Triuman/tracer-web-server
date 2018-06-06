"use strict";

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
      NO_READY_ROOM_IN_QUEUE: 14
};

const Enum_Driver_Room_Status = {
      OFFLINE: 0,
      NOT_READY: 1,
      READY: 2
};

const UpdateTypes = {
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

var socket;

window.onload = function () {
   socket = io('/tradmin');

   socket.on('connect', () => {
      console.log("Socket connected");
      //Try to login if we have token in the local storage
      var token = localStorage.getItem("token");
      if (token)
         Authenticate(token);

   });

   socket.on('disconnect', () => {
      console.log("Socket disconnected");
   });



}



function Authenticate(u, p){
   if(!p && u){
      //We are using token authentication
      socket.emit("authenticate", {token: u }, (data) => {
         console.log("Are we authenticated? -> ");
         console.log(data);
      });
   }else{
      socket.emit("authenticate", {username: u, password: p }, (data) => {
         console.log("Are we authenticated? -> ");
         console.log(data);
      });
   }
}

function TakeNextRoomIn(track_id){
   socket.emit("takenextroomin", { track_id }, (data) => {
      console.log("Did we got room info? -> ");
      console.log(data);
   });
}

function StartRace(race_id){
   socket.emit("startrace", { race_id }, (data) => {
      console.log("Did we start the race? -> ");
      console.log(data);
   });
}

function KickDriverOut(race_id, driver_id){
   socket.emit("kick-driver-out", { race_id, driver_id }, (data) => {
      console.log("Did we send chat to the room? -> ");
      console.log(data);
   });
}

function StartAllStreams(chat){
   socket.emit("start-all-streams", { track_id }, (data) => {
      console.log("Did we send chat to everyone? -> ");
      console.log(data);
   });
}

function ConnectToDriverModified(driver_id){
   socket.emit("connecttodrivermodified", { driver_id }, (data) => {
      console.log("Did we connect to driver : ? -> " + driver_id);
      console.log(data);
   });
}

function Watch(driver_id){
   socket.emit("watch", { driver_id }, (data) => {
      console.log("Did we start watching : ? -> " + driver_id);
      console.log(data);
   });
}

function SetDriverOfCar(driver_id, car_id){
   socket.emit("setdriverofcar", { driver_id, car_id }, (data) => {
      console.log("Did we set driver of car : ? -> " + driver_id + " - " + car_id);
      console.log(data);
   });
}

function StartRecording(driver_id){
   socket.emit("startrecording", { driver_id }, (data) => {
      console.log("Did we start recording : ? -> " + driver_id);
      console.log(data);
   });
}

function StopRecording(driver_id){
   socket.emit("stoprecording", { driver_id }, (data) => {
      console.log("Did we stop recording : ? -> " + driver_id);
      console.log(data);
   });
}

function StartToDriverModified(driver_id){
   socket.emit("streamtodrivermodified", { driver_id }, (data) => {
      console.log("Did we start stream to driver : ? -> " + driver_id);
      console.log(data);
   });
}

