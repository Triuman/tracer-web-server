//Keep all connection stuff with local servers here.
var WebSocket = require('ws');

var wsSocketList = {};
var gameServer = null;
var wsProtocol = "tracer-protocol";

/* TODO: Put local server ip and port */
      //var localServerAddress = 'ws://127.0.0.1:8188';
      //var localServerAddress = 'ws://192.168.1.22:8188';

module.exports = {
   start: function (_gameServer, track_list) {
      gameServer = _gameServer;
      function connectToLocalServer(track){
        setTimeout(function(){
           try{
              var ws = new WebSocket(track.server_address, wsProtocol);
              ws.track = track;
              wsSocketList[track.uuid]=ws;
              ws.on('error', function (err) {
                 //console.log(err);
             });
             ws.on('open', function open() {
               console.log('connected to local server');
               //ws.send(JSON.stringify({command: "addtrack", id: "myNewTrack1", list1: [[5.3, 2.5],[6.3, 4.5],[45.3, 53.64],[92.32, 41.63]], list2: [[5.3, 2.5],[6.3, 4.5],[45.3, 53.64],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63]]}));
         
               ws.on('message', function incoming(data) {
                 console.log("LS says -> " + data);
                 var request = JSON.parse(data);
         
                 switch (request.info) {
                     case 'firstconnection':
                       //This means LS was restarted and has no info about track lines, race and drivers. If there is a room in race, we need to call create race.
                       gameServer.on_firstconnection(ws.track.uuid);
                       break;
                     case 'offer':
                       //Send sdp to game server with driverId
                       gameServer.on_offer(ws.track.uuid, request.driverid, request.sdp, request.isleft);
                       break;
                     case 'webrctup':
                       //Let Game Server know that driver connected to Local Server via WebRTC
                       gameServer.on_webrtcup(ws.track.uuid, request.driverid);
                       break;
                     case 'hangup':
                       //Let Game Server know that driver connected to Local Server via WebRTC
                       gameServer.on_hangup(ws.track.uuid, request.driverid);
                       break;
                     case 'carconnected':
                       //Let Game Server know that Car is connected to LS
                       gameServer.on_carconnected(ws.track.uuid, request.carid);
                     break;
                     case 'cardisconnected':
                       //Let Game Server know that Car is disconnected from LS
                       gameServer.on_cardisconnected(ws.track.uuid, request.carid);
                     break;
                 }
               });
             });
             
             ws.on('close', function close() {
               console.log(ws.track);
               console.log('disconnected from local server');
               console.log('trying to reconnect..');
               connectToLocalServer(track);
             });
           }catch(err){
              connectToLocalServer(track);
           }
        }, 3000);
     }

    for(var track_id in track_list){
     if(track_list[track_id].server_address)
      connectToLocalServer(track_list[track_id]);
    }
   },
   sendMessage: function (track_id, msg) {
     var ws = wsSocketList[track_id];
     console.log(track_id);
      if (this.isServerUp(track_id)){
         ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
         console.log("Sent message to Local Sever -> " + (typeof msg === 'string' ? msg : JSON.stringify(msg)));
         return true;
      }else{
         console.log("Cannot send message to LS. Connection is DOWN!");
         return false;
      }
   },
   isServerUp: function(track_id){
      return wsSocketList[track_id] && wsSocketList[track_id].readyState == WebSocket.OPEN;
   },
   setTrackLines: function (track_id, list1, list2) {
      return this.sendMessage(track_id, { command: "settracklines", list1, list2 });
   },
   createRace: function (track_id, id, max_duration, driver_ids, car_ids) {
      //Driver count can be bigger than car id count but not vice versa. LS will ignore the extra cars anyways.
      return this.sendMessage(track_id, { command: "createrace", id, max_duration, driver_ids, car_ids });
   },
   addCarToRace: function (track_id, carid, raceid, driverid) {
      return this.sendMessage(track_id, { command: "addcartorace", carid, raceid, driverid });
   },
   removeCarFromRace: function (track_id, carid) {
      return this.sendMessage(track_id, { command: "removecarfromrace", carid, raceid });
   }, 
   startRace: function (track_id, raceid) {
      return this.sendMessage(track_id, { command: "startrace", raceid });
   },
   pauseRace: function (track_id, raceid) {
      return this.sendMessage(track_id, { command: "pauserace", raceid });
   },
   resumeRace: function (track_id, raceid) {
      return this.sendMessage(track_id, { command: "resumerace", raceid });
   },
   endRace: function (track_id, raceid) {
      return this.sendMessage(track_id, { command: "endrace", raceid });
   },
   abortRace: function (track_id, raceid) {
      return this.sendMessage(track_id, { command: "abortrace", raceid });
   },
   connectToDriver: function (track_id, driverid) {
      //Tell LS to establish a webRTC connection with this Driver.
      return this.sendMessage(track_id, { command: "connecttodriver", id:driverid });
   },
   disconnectDriver: function (track_id, driverid) {
      return this.sendMessage(track_id, { command: "disconnectdriver", driverid });
   },
   //#########################################
   //REMOVE LINE BELOW!!!!!
   streamToDriverModified: function (track_id, driverid) {
      return this.sendMessage(track_id, { command: "startstream", driverid });
    },
    watch: function (track_id, driverid) {
      return this.sendMessage(track_id, { command: "watch", id: driverid });
   },
   startRecording: function (track_id, driverid) {
      return this.sendMessage(track_id, { command: "startrecording", driverid });
   },
   stopRecording: function (track_id, driverid) {
      return this.sendMessage(track_id, { command: "stoprecording", driverid });
   },
   //#########################################
   //#########################################
   streamToDriver: function (track_id, driverid, carid) {
      return this.sendMessage(track_id, { command: "startstream", driverid, carid });
   },
   startStreamAndControl: function (track_id, driverid, carid) {
      return this.sendMessage(track_id, { command: "startstreamandcontrol", driverid, carid });
   },
   stopStreamAndControl: function (track_id, driverid) {
      return this.sendMessage(track_id, { command: "stopstreamandcontrol", driverid });
   },
   stopStreamToDriver: function (track_id, driverid) {
      return this.sendMessage(track_id, { command: "stopstream", driverid });
   },
   setDriverOfCar: function (track_id, driverid, carid) {
      return this.sendMessage(track_id, { command: "setdriverofcar", driverid, carid });
   },
   giveControlToDriver: function (track_id, driverid) {
      return this.sendMessage(track_id, { command: "addcontrol", driverid });
   },
   cutControlOfDriver: function (track_id, driverid) {
      return this.sendMessage(track_id, { command: "removecontrol", driverid });
   },
   cutAllControls: function (track_id, raceid) {
      return this.sendMessage(track_id, { command: "removeallcontrols", raceid });
   },
   cutAllStreams: function (track_id, raceid) {
      return this.sendMessage(track_id, { command: "stopallstreams", raceid });
   },
   controlCar: function (track_id, carid, throttle, steering) {
      return this.sendMessage(track_id, { command: "controlcar", carid, throttle, steering });
   },
   sendAnswerSdp: function (track_id, driverid, answersdp, isleft) {
      return this.sendMessage(track_id, { command: "answersdp", answersdp, driverid, isleft });
   },
   sendCandidate: function (track_id, driverid, candidate, isleft) {
      return this.sendMessage(track_id, { command: "candidate", candidate, driverid, isleft });
   },
   setStreamUrl: function (track_id, carid, url) {
      return this.sendMessage(track_id, { command: "setstreamurl", url, carid });
   },
   
}