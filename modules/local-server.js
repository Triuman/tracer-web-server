//Keep all connection stuff with local servers here.
var WebSocket = require('ws');

var wsSocketList = {};
var gameServer = null;
var wsProtocol = "tracer-protocol";

/* TODO: Put local server ip and port */
      //var localServerAddress = 'ws://demos.kaazing.com/echo';
      //var localServerAddress = 'ws://127.0.0.1:8188';
      //var localServerAddress = 'ws://192.168.1.34:8188';

module.exports = {
   start: function (_gameServer, track_list) {
      gameServer = _gameServer;


    for(var track_id in track_list){
      function connectToLocalServer(track){
        setTimeout(function(){
           try{
              ws = new WebSocket(track.server_address, wsProtocol);
              ws.track = track;
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
                     case 'firstconneciton':
                       //This means LS was restarted and has no info about race and drivers. If there is a room in race, we need to call create race.
                       gameServer.on_firstconnection();
                       break;
                     case 'offer':
                       //Send sdp to game server with driverId
                       gameServer.on_offer(request.driverid, request.sdp, request.isleft);
                       break;
                     case 'webrctup':
                       //Let Game Server know that driver connected to Local Server via WebRTC
                       gameServer.on_webrtcup(request.driverid);
                       break;
                     case 'hangup':
                       //Let Game Server know that driver connected to Local Server via WebRTC
                       gameServer.on_hangup(request.driverid);
                       break;
                     case 'carconnected':
                       //Let Game Server know that Car is connected to LS
                       gameServer.on_carconnected(request.carid);
                     break;
                     case 'cardisconnected':
                       //Let Game Server know that Car is disconnected from LS
                       gameServer.on_cardisconnected(request.carid);
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
     if(track_list[track_id].server_address)
      connectToLocalServer(track_list[track_id]);
    }
   },
   sendMessage: function (track_id, msg) {
     var ws = wsSocketList[track_id];
      if (ws && ws.readyState == ws.OPEN){
         ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
         console.log("Sent message to Local Sever -> " + (typeof msg === 'string' ? msg : JSON.stringify(msg)));
      }else{
         console.log("LS connection is DOWN!");
      }
   },
   createTrack: function (track_id, id, list1, list2) {
      this.sendMessage(track_id, { command: "createtrack", id, list1, list2 });
   },
   createRace: function (track_id, id, max_duration, driver_ids, car_ids) {
      //Driver count can be bigger than car id count but not vice versa. LS will ignore the extra cars anyways.
      this.sendMessage(track_id, { command: "createrace", id, max_duration, driver_ids, car_ids });
   },
   addCarToRace: function (track_id, carid, raceid, driverid) {
      this.sendMessage(track_id, { command: "addcartorace", carid, raceid, driverid });
   },
   removeCarFromRace: function (track_id, carid) {
      this.sendMessage(track_id, { command: "removecarfromrace", carid, raceid });
   }, 
   startRace: function (track_id, raceid) {
      this.sendMessage(track_id, { command: "startrace", raceid });
   },
   pauseRace: function (track_id, raceid) {
      this.sendMessage(track_id, { command: "pauserace", raceid });
   },
   resumeRace: function (track_id, raceid) {
      this.sendMessage(track_id, { command: "resumerace", raceid });
   },
   endRace: function (track_id, raceid) {
      this.sendMessage(track_id, { command: "endrace", raceid });
   },
   abortRace: function (track_id, raceid) {
      this.sendMessage(track_id, { command: "abortrace", raceid });
   },
   connectToDriver: function (track_id, driverid) {
      //Tell LS to establish a webRTC connection with this Driver.
      this.sendMessage(track_id, { command: "connecttodriver", id:driverid });
   },
   disconnectDriver: function (track_id, driverid) {
      this.sendMessage(track_id, { command: "disconnectdriver", driverid });
   },
   //#########################################
   //REMOVE LINE BELOW!!!!!
   streamToDriverModified: function (track_id, driverid) {
    this.sendMessage(track_id, { command: "startstream", driverid });
    },
    watch: function (track_id, id) {
      this.sendMessage(track_id, { command: "watch", id });
   },
   startRecording: function (track_id, driverid) {
      this.sendMessage(track_id, { command: "startrecording", driverid });
   },
   stopRecording: function (track_id, driverid) {
      this.sendMessage(track_id, { command: "stoprecording", driverid });
   },
   //#########################################
   //#########################################
   streamToDriver: function (driverid, carid) {
      this.sendMessage(track_id, { command: "startstream", driverid, carid });
   },
   startStreamAndControl: function (driverid, carid) {
      this.sendMessage(track_id, { command: "startstreamandcontrol", driverid, carid });
   },
   stopStreamAndControl: function (driverid) {
      this.sendMessage(track_id, { command: "stopstreamandcontrol", driverid });
   },
   stopStreamToDriver: function (driverid) {
      this.sendMessage(track_id, { command: "stopstream", driverid });
   },
   setDriverOfCar: function (driverid, carid) {
      this.sendMessage(track_id, { command: "setdriverofcar", driverid, carid });
   },
   giveControlToDriver: function (driverid, carid) {
      this.sendMessage(track_id, { command: "addcontrol", driverid, carid });
   },
   cutControlOfDriver: function (driverid) {
      this.sendMessage(track_id, { command: "removecontrol", driverid });
   },
   cutAllControls: function (raceid) {
      this.sendMessage(track_id, { command: "removeallcontrols", raceid });
   },
   cutAllStreams: function (raceid) {
      this.sendMessage(track_id, { command: "stopallstreams", raceid });
   },
   controlCar: function (carid, throttle, steering) {
      this.sendMessage(track_id, { command: "controlcar", carid, throttle, steering });
   },
   sendAnswerSdp: function (driverid, answersdp, isleft) {
      this.sendMessage(track_id, { command: "answersdp", answersdp, driverid, isleft });
   },
   sendCandidate: function (driverid, candidate, isleft) {
      this.sendMessage(track_id, { command: "candidate", candidate, driverid, isleft });
   },
   setStreamUrl: function (carid, url) {
      this.sendMessage(track_id, { command: "setstreamurl", url, carid });
   },
   
}