"use strict";

//Callback fail reasons
const Enum_Callback_Reason = {
   ALREADY_LOGGED_IN: 0,
   NOT_LOGGED_IN: 1,
   TOKEN_EXPIRED: 2,
   WRONG_CREDENTIALS: 3,
   MISSING_INFO: 4,
   DB_ERROR: 5,
   NOT_ENOUGH_COIN: 6
};

var driver = null;

var socket;
window.onload = function () {
   socket = io();

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

   socket.on('offer', (data) => {
      console.log("Got offer! -> " + data.sdp);
      WebRTCConnection.setOffer(data.sdp);
   });

   socket.on('global-chat', data => {
      console.log("Global chat ->");
      console.log(data);
   });

   socket.on('room-chat', data => {
      console.log("Room chat ->");
      console.log(data);
   });

};
function Register(u, p, e) {
   socket.emit("register", { username: u, password: p, email: e }, (data) => {
      console.log("Are we Registered? -> ");
      onAuthenticate(data);
   });
}

function SendAnswer(sdp) {
   socket.emit("answer", { sdp }, (data) => {
      console.log("Did we send answer? -> ");
      console.log(data);
      if(data.success == false){
         switch(data.reason){
            case Enum_Callback_Reason.DB_ERROR:
            break;
         }
      }
   });
}

function SendIceCandidate(candidate) {
   socket.emit("candidate", { candidate }, (data) => {
      console.log("Did we send candidate? -> ");
      console.log(data);
      if(data.success == false){
         switch(data.reason){
            case Enum_Callback_Reason.DB_ERROR:
            break;
         }
      }
   });
}

function Logout() {
   socket.emit("logout", { }, (data) => {
      console.log("We logged out? -> ");
      console.log(data);
      if(data.success == false){
         switch(data.reason){
            case Enum_Callback_Reason.DB_ERROR:
            break;
         }
      }
   });
   localStorage.removeItem("token"); //Even log out fails, we log out from here anyways.
   //TODO: And do some other stuff.
}

function Authenticate(u, p) {
   if (!p && u) {
      console.log("We are using token authentication. ->");
      console.log(u);
      socket.emit("authenticate", { token: u }, (data) => {
         onAuthenticate(data);
      });
   } else {
      socket.emit("authenticate", { username: u, password: p }, (data) => {
         onAuthenticate(data);
      });
   }
}

function onAuthenticate(data) {
   console.log("Are we authenticated? -> ");
   console.log(data);
   if (data.success) {
      driver = data.driver;
      localStorage.setItem("token", data.token);
   } else {
      //TODO: Check different reasons and do something about it.
      switch (data.reason) {
         case Enum_Callback_Reason.ALREADY_LOGGED_IN:
         console.log("ALREADY_LOGGED_IN");
         break;
         case Enum_Callback_Reason.DB_ERROR:
         console.log("DB_ERROR");
         break;
         case Enum_Callback_Reason.TOKEN_EXPIRED:
         console.log("TOKEN_EXPIRED");
         break;
         case Enum_Callback_Reason.WRONG_CREDENTIALS:
         console.log("WRONG_CREDENTIALS");
         break;
         case Enum_Callback_Reason.MISSING_INFO:
         console.log("MISSING_INFO");
         break;
      }
   }
}

function CreateRoom(room_name, track_id) {
   socket.emit("create-room", { room_name, track_id }, (data) => {
      console.log("Did we got a new room? -> ");
      console.log(data);
      if(data.success == false){
         switch(data.reason){
            case Enum_Callback_Reason.MISSING_INFO:
            break;
         }
      }
   });
}

function JoinRoom(roomId) {
   socket.emit("join-room", { room_id: roomId }, (data) => {
      console.log("Did we join to the room? -> ");
      console.log(data);
      if(data.success == false){
         switch(data.reason){
            case Enum_Callback_Reason.MISSING_INFO:
            break;
         }
      }
   });
}

function SendRoomChat(chat) {
   socket.emit("room-chat", { chat }, (data) => {
      console.log("Did we send chat to the room? -> ");
      console.log(data);
      if(data.success == false){
         switch(data.reason){
            case Enum_Callback_Reason.MISSING_INFO:
            break;
         }
      }
   });
}

function SendGlobalChat(chat) {
   socket.emit("global-chat", { chat }, (data) => {
      console.log("Did we send chat to everyone? -> ");
      console.log(data);
      if(data.success == false){
         switch(data.reason){
            case Enum_Callback_Reason.MISSING_INFO:
            break;
         }
      }
   });
}


var WebRTCConnection = new function () {
   var pc;
   var configuration = {
      "iceServers": [{ "url": "stun:stun.1.google.com:19302" }]
   };

   pc = new RTCPeerConnection(configuration);

   // send any ice candidates to the other peer
   pc.onicecandidate = function (evt) {
      console.log("We got a candidate!");
      SendIceCandidate(evt.candidate);
   };

   // once remote stream arrives, show it in the remote video element
   pc.onaddstream = function (evt) {
      console.log("We got remote stream!!");
      //document.getElementById("remoteView").src = URL.createObjectURL(evt.stream);
   };


   var dataChannelOptions = {
      ordered: false, // do not guarantee order
      maxRetransmitTime: 500, // in milliseconds
   };
   var dataChannel = pc.createDataChannel("mychannel", dataChannelOptions);

   dataChannel.onerror = function (error) {
      console.log("Data Channel Error:", error);
   };

   dataChannel.onmessage = function (event) {
      console.log("Got Data Channel Message:", event.data);
   };

   dataChannel.onopen = function () {
      console.log("The Data Channel is Opened!");
      dataChannel.send("0" + driver.uuid_id);
   };

   dataChannel.onclose = function () {
      console.log("The Data Channel is Closed");
   };


   function gotDescription(desc) {
      pc.setLocalDescription(desc);
      SendAnswer(desc);
   }
   function failedDescription(desc) {
      console.log("Couldnt create answer.");
   }

   return {
      setOffer: function (sdp) {
         pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp })).then(function () {
            pc.createAnswer(gotDescription, failedDescription);
         });

      },
      setIceCandidate: function (candidate) {
         pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
   };
};
