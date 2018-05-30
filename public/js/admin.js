
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

