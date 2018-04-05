
var ws;
var sessionId, handleId;

window.onload = function () {

   ws = new WebSocket("ws://192.168.1.21:8188", "janus-protocol");

   ws.onopen = function()
   {
      console.log("Websocket is open!");
   };

   ws.onmessage = function (evt) 
   { 
      console.log("We got message ->");
      console.log(evt.data);

      var message = JSON.parse(evt.data);

      //{janus: "success", transaction: "2zy1IQbQQub4", data: {id: 6295649740923107}}

         if(message.transaction == "sessionid"){
            //we got our session id.
            sessionId = message.data.id;
            attachToPlugin();
         }
         if(message.transaction == "handleid"){
            //we got our handle id.
            handleId = message.data.id;
         }
         if(message.jsep){
            onOffer(message.jsep.sdp);
         }


   };

   ws.onclose = function()
   { 
      // websocket is closed.
      console.log("Connection is closed..."); 
   };
   
   window.onbeforeunload = function(event) {
      socket.close();
   };
};

function createSession(){
   ws.send(JSON.stringify({janus: "create", transaction: "sessionid"}))
}

function attachToPlugin(){
   //{"janus":"attach","plugin":"janus.plugin.streaming","opaque_id":"streamingtest-ElYGvmJfdjVJ","transaction":"9GoMfarGg45x"}
   ws.send(JSON.stringify({janus: "attach", session_id: sessionId, transaction: "handleid", plugin:"janus.plugin.streaming"}))
}

function sendWatchRequest(){
   //{"janus":"message","body":{"request":"watch","id":1},"transaction":"TylNwA0pUH9Y"}
   ws.send(JSON.stringify({janus: "message", session_id: sessionId, handle_id: handleId, "body":{ request:"watch",id:1 }, transaction: "watchrequest"}))
}

function onOffer(sdp){
   WebRTCConnection.setOffer(sdp);
}

function onCandidate(candidate){
   WebRTCConnection.setIceCandidate(candidate);
}

function sendAnswer(sdp){
   //{"janus":"message","body":{"request":"start"},"transaction":"o60q3UCJXyxo","jsep":{"type":"answer","sdp":""}}
   ws.send(JSON.stringify({"janus":"message", session_id: sessionId, handle_id: handleId,"body":{"request":"start"},"transaction":"o60q3UCJXyxo","jsep":sdp}));
}

function sendCandidate(candidate){
   //{"janus":"trickle","candidate":{"candidate":"candidate:2896278100 1 udp 2113937151 192.168.1.36 51302 typ host generation 0 ufrag HGwr network-cost 50","sdpMid":"audio","sdpMLineIndex":0},"transaction":"BzsYTE0OrygE"}
   ws.send(JSON.stringify({"janus":"trickle", session_id: sessionId, handle_id: handleId,"candidate":candidate,"transaction":"BzsYTE0OrygE"}));
}


var WebRTCConnection = new function () {
   var pc;
   var dataChannel;
   var configuration = {
      "iceServers": [{ "url": "stun:stun.1.google.com:19302" }]
   };


   function gotLocalDescription(desc) {
      pc.setLocalDescription(desc);
      sendAnswer(desc);
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
            sendCandidate(evt.candidate);
         };

         // once remote stream arrives, show it in the remote video element
         pc.ontrack = function (event) {
            console.log("We got remote stream!!");
            document.getElementById("remoteView").srcObject = event.streams[0];
            //document.getElementById("remoteView").src = URL.createObjectURL(event.streams[0]);
         };


         pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp })).then(function () {
            pc.createAnswer(gotLocalDescription, failedLocalDescription);
         });

      //    var dataChannelOptions = {
      //       ordered: false, // do not guarantee order
      //       maxRetransmitTime: 500, // in milliseconds
      //    };
      //    if (dataChannel)
      //       dataChannel.close();
      //    dataChannel = pc.createDataChannel("mychannel", dataChannelOptions);

      //    dataChannel.onerror = function (error) {
      //       console.log("Data Channel Error:", error);
      //    };

      //    dataChannel.onmessage = function (event) {
      //       console.log("Got Data Channel Message:", event.data);
      //    };

      //    dataChannel.onopen = function () {
      //       console.log("The Data Channel is Opened!");
      //       dataChannel.send("0" + driver.uuid_id);
      //    };

      //    dataChannel.onclose = function () {
      //       console.log("The Data Channel is Closed");
      //    };


      },
      setIceCandidate: function (candidate) {
         pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
   };
};