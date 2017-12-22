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
   SAME_USERNAME_OR_EMAIL_EXIST: 8,
   NO_TRACK_WITH_GIVEN_ID: 9,
   NO_ROOM_WITH_GIVEN_ID: 10
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

   socket.on('snapshot', (data) => {
      console.log("Got a snapshot -> ");
      console.log(data);
   });

   socket.on('offer', (data) => {
      console.log("Got offer! -> " + data.sdp);
      WebRTCConnection.setOffer(data.sdp);
   });

   socket.on('room-update', (update) => {
      console.log("Got room update! -> " + update);
      UpdateHandler[update.type](update.data);
   });
   var RoomUpdateHandler = {};
   RoomUpdateHandler[UpdateTypes.DRIVER_JOINED_ROOM] = function (data) {
      //put driver to next empty slot
   };
   RoomUpdateHandler[UpdateTypes.DRIVER_LEFT_ROOM] = function (data) {
      //remove driver from the slot
   };
   RoomUpdateHandler[UpdateTypes.DRIVER_GOT_ONLINE] = function (data) {
      //change slot to online/not ready view
   };
   RoomUpdateHandler[UpdateTypes.DRIVER_GOT_OFFLINE] = function (data) {
      //change slot to offline view
   };
   RoomUpdateHandler[UpdateTypes.DRIVER_IS_READY] = function (data) {
      //set driver's slot to green
   };
   RoomUpdateHandler[UpdateTypes.DRIVER_IS_NOT_READY] = function (data) {
      //set driver's slot to yellow
   };
   RoomUpdateHandler[UpdateTypes.ADMIN_CHANGED] = function (data) {
      //if this is admin, let him see kick buttons. Now he is able to kick other drivers.
   };
   RoomUpdateHandler[UpdateTypes.ROOM_CHAT] = function (data) {
      console.log("Room chat ->");
      console.log(data);
   };

   //TODO: If you cannot find a track or room or driver with the given id on updates, there is an inconsistency. So, request a new snapshot from the Web Server to catch up.
   socket.on('update', (update) => {
      console.log("Got update! -> " + update);
      UpdateHandler[update.type](update.data);
   });

   var UpdateHandler = {};
   UpdateHandler[UpdateTypes.ROOM_CREATED] = function (data) {
      //append room to the track's room list
   };
   UpdateHandler[UpdateTypes.ROOM_CLOSED] = function (data) {
      //remove room from its track's room list
   };
   UpdateHandler[UpdateTypes.ROOM_ENTERED_RACE] = function (data) {
      //remove room from its track's room list and show it over the camera stream.
   };
   UpdateHandler[UpdateTypes.ROOM_FINISHED_RACE] = function (data) {
      //show result of the race.
   };
   UpdateHandler[UpdateTypes.DRIVER_JOINED_ROOM] = function (data) {
      //set room driver count text
   };
   UpdateHandler[UpdateTypes.DRIVER_LEFT_ROOM] = function (data) {
      //set room driver count text
   };
   UpdateHandler[UpdateTypes.DRIVER_IS_READY] = function (data) {
      //set one more slot to green of the room in the room list
   };
   UpdateHandler[UpdateTypes.DRIVER_IS_NOT_READY] = function (data) {
      //set one more slot to yellow of the room in the room list
   };
   UpdateHandler[UpdateTypes.GLOBAL_CHAT] = function (data) {
      console.log("Global chat ->");
      console.log(data);
      if (data.track_id && data.chat) {
         //TODO: Append new chat to the track with track_id
      }
   };

};

function SetReady(){
   //we tell web server that we are ready to race.
   socket.emit("ready", function(data){
      if(data.success){
         //set "Set Ready" button to "Not Ready"
      }else{

      }
   });
}
function SetNotReady(){
   //we tell web server that we are ready to race.
   socket.emit("notready", function(data){
      if(data.success){
         //set "Set Not Ready" button to "Set Ready"
      }else{
         
      }
   });
}

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
      if (data.success == false) {
         switch (data.reason) {
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
      if (data.success == false) {
         switch (data.reason) {
            case Enum_Callback_Reason.DB_ERROR:
               break;
         }
      }
   });
}

function Logout() {
   socket.emit("logout", {}, (data) => {
      console.log("We logged out? -> ");
      console.log(data);
      if (data.success == false) {
         switch (data.reason) {
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
            //remove token from the local storage
            localStorage.removeItem("token");
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
      if (data.success == false) {
         switch (data.reason) {
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
      if (data.success == false) {
         switch (data.reason) {
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
      if (data.success == false) {
         switch (data.reason) {
            case Enum_Callback_Reason.MISSING_INFO:
               break;
         }
      }
   });
}

function SendGlobalChat(track_id, chat) {
   socket.emit("global-chat", { track_id, chat }, (data) => {
      console.log("Did we send chat to everyone? -> ");
      console.log(data);
      if (data.success == false) {
         switch (data.reason) {
            case Enum_Callback_Reason.MISSING_INFO:
               break;
         }
      }
   });
}


var WebRTCConnection = new function () {
   var pc;
   var dataChannel;
   var configuration = {
      "iceServers": [{ "url": "stun:stun.1.google.com:19302" }]
   };


   function gotLocalDescription(desc) {
      pc.setLocalDescription(desc);
      SendAnswer(desc);
   }
   function failedLocalDescription(desc) {
      console.log("Couldnt create answer.");
   }

   return {
      setOffer: function (sdp) {
         //Each time we get a new offer, we create a new RTCPeerConnection.

         if (pc)
            pc.close();
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


         pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp })).then(function () {
            pc.createAnswer(gotLocalDescription, failedLocalDescription);
         });

         var dataChannelOptions = {
            ordered: false, // do not guarantee order
            maxRetransmitTime: 500, // in milliseconds
         };
         if (dataChannel)
            dataChannel.close();
         dataChannel = pc.createDataChannel("mychannel", dataChannelOptions);

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


      },
      setIceCandidate: function (candidate) {
         pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
   };
};
