
const socket = io('/tradmin');

socket.on('connect', () => {
   console.log("Socket connected");
});

socket.on('disconnect', () => {
   console.log("Socket disconnected");
});


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

