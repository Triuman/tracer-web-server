
const socket = io('/tradmin');

socket.on('connect', () => {
   console.log("Socket connected");
});

socket.on('disconnect', () => {
   console.log("Socket disconnected");
});

socket.on('offer', (data) => {
   console.log("Got offer! -> " + data.sdp);
});

socket.on('global-chat', data => {
   console.log("Global chat ->");
   console.log(data);
});

socket.on('room-chat', data => {
   console.log("Room chat ->");
   console.log(data);
});

function Register(u, p, e){
   socket.emit("register", {username: u, password: p, email: e }, (data) => {
      console.log("Are we Registered? -> ");
      console.log(data);
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

function CreateRoom(){
   socket.emit("create-room", { room_name: "myRoom", track_id: "something" }, (data) => {
      console.log("Did we got a new room? -> ");
      console.log(data);
   });
}

function JoinRoom(roomId){
   socket.emit("join-room", { room_id: roomId }, (data) => {
      console.log("Did we got a new room? -> ");
      console.log(data);
   });
}

function SendRoomChat(chat){
   socket.emit("room-chat", { chat: chat }, (data) => {
      console.log("Did we send chat to the room? -> ");
      console.log(data);
   });
}

function SendGlobalChat(chat){
   socket.emit("global-chat", { chat: chat }, (data) => {
      console.log("Did we send chat to everyone? -> ");
      console.log(data);
   });
}

