"use strict";

var driver = null;
var token = null;

const socket = io();

socket.on('connect', () => {
   console.log("Socket connected");
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

function Register(u, p, e) {
   socket.emit("register", { username: u, password: p, email: e }, (data) => {
      console.log("Are we Registered? -> ");
      console.log(data);
   });
}

function SendAnswer(sdp) {
   socket.emit("answer", { sdp }, (data) => {
      console.log("Did we send answer? -> ");
      console.log(data);
   });
}

function SendIceCandidate(candidate) {
   socket.emit("candidate", { candidate }, (data) => {
      console.log("Did we send candidate? -> ");
      console.log(data);
   });
}

function Authenticate(u, p) {
   if (!p && u) {
      console.log("We are using token authentication. ->");
      console.log(u);
      socket.emit("authenticate", { token: u }, (data) => {
         console.log("Are we authenticated? -> ");
         console.log(data);
         driver = data.driver;
         token = data.token;
      });
   } else {
      socket.emit("authenticate", { username: u, password: p }, (data) => {
         console.log("Are we authenticated? -> ");
         console.log(data);
         driver = data.driver;
         token = data.token;
      });
   }
}

function CreateRoom() {
   socket.emit("create-room", { room_name: "myRoom", track_id: "something" }, (data) => {
      console.log("Did we got a new room? -> ");
      console.log(data);
   });
}

function JoinRoom(roomId) {
   socket.emit("join-room", { room_id: roomId }, (data) => {
      console.log("Did we join to the room? -> ");
      console.log(data);
   });
}

function SendRoomChat(chat) {
   socket.emit("room-chat", { chat: chat }, (data) => {
      console.log("Did we send chat to the room? -> ");
      console.log(data);
   });
}

function SendGlobalChat(chat) {
   socket.emit("global-chat", { chat: chat }, (data) => {
      console.log("Did we send chat to everyone? -> ");
      console.log(data);
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
         pc.setRemoteDescription(new RTCSessionDescription({type: "offer", sdp})).then(function () {
            pc.createAnswer(gotDescription, failedDescription);
         });

      },
      setIceCandidate: function (candidate) {
         pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
   };
};
