//Keep all connection stuff with local server here.
var WebSocket = require('ws');

var ws = null;
var gameServer = null;

module.exports = {
   start: function (_gameServer) {
      gameServer = _gameServer;

      /* TODO: Put local server ip and port */
      //var localServerAddress = 'ws://demos.kaazing.com/echo';
      //var localServerAddress = 'ws://127.0.0.1:8188';
      var localServerAddress = 'ws://192.168.1.26:8188';
      var wsProtocol = "tracer-protocol";
      
      function connectToLocalServer(){
         setTimeout(function(){
            try{
               ws = new WebSocket(localServerAddress, wsProtocol);
               ws.on('error', function (err) {
                  //console.log(err);
              });
               ws.on('open', function open() {
                  console.log('connected to local server');
                  //ws.send(JSON.stringify({command: "addtrack", id: "myNewTrack1", list1: [[5.3, 2.5],[6.3, 4.5],[45.3, 53.64],[92.32, 41.63]], list2: [[5.3, 2.5],[6.3, 4.5],[45.3, 53.64],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63],[92.32, 41.63]]}));
               });
         
               ws.on('close', function close() {
                  console.log('disconnected from local server');
                  console.log('trying to reconnect..');
                  connectToLocalServer();
               });
         
               ws.on('message', function incoming(data) {
                  console.log("LS says -> " + data);
                  var request = JSON.parse(data);
         
                  switch (request.info) {
                     case 'offer':
                        //Send sdp to game server with driverId
                        gameServer.on_offer(request.driverid, request.sdp);
                        break;
                     case 'webrctup':
                        //Let Game Server know that driver connected to Local Server via WebRTC
                        gameServer.on_webrctup(request.driverid);
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
            }catch(err){
               connectToLocalServer();
            }
         }, 3000);
      }
      connectToLocalServer();
   },
   sendMessage: function (msg) {
      if (ws.readyState == ws.OPEN){
         ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
         console.log("Sent message to Local Sever -> " + (typeof msg === 'string' ? msg : JSON.stringify(msg)));
      }else{
         console.log("LS connection is DOWN!");
      }
   },
   createTrack: function (id, list1, list2) {
      this.sendMessage({ command: "createtrack", id, list1, list2 });
   },
   createRace: function (id, max_duration, driver_ids, car_ids) {
      //Driver count can be bigger than car id count but not vice versa. LS will ignore the extra cars anyways.
      this.sendMessage({ command: "createrace", id, max_duration, driver_ids, car_ids });
   },
   addCarToRace: function (carid, raceid, driverid) {
      this.sendMessage({ command: "addcartorace", carid, raceid, driverid });
   },
   removeCarFromRace: function (carid) {
      this.sendMessage({ command: "removecarfromrace", carid, raceid });
   }, 
   startRace: function (raceid) {
      this.sendMessage({ command: "startrace", raceid });
   },
   pauseRace: function (raceid) {
      this.sendMessage({ command: "pauserace", raceid });
   },
   resumeRace: function (raceid) {
      this.sendMessage({ command: "resumerace", raceid });
   },
   endRace: function (raceid) {
      this.sendMessage({ command: "endrace", raceid });
   },
   abortRace: function (raceid) {
      this.sendMessage({ command: "abortrace", raceid });
   },
   connectToDriver: function (driverid) {
      //Tell LS to establish a webRTC connection with this Driver.
      this.sendMessage({ command: "connecttodriver", id:driverid });
   },
   disconnectDriver: function (driverid) {
      this.sendMessage({ command: "disconnectdriver", driverid });
   },
   //#########################################
   //REMOVE LINE BELOW!!!!!
   streamToDriverModified: function (driverid) {
    this.sendMessage({ command: "startstream", driverid });
    },
    watch: function (id) {
      this.sendMessage({ command: "watch", id });
   },
   startRecording: function (driverid) {
      this.sendMessage({ command: "startrecording", driverid });
   },
   stopRecording: function (driverid) {
      this.sendMessage({ command: "stoprecording", driverid });
   },
   //#########################################
   //#########################################
   streamToDriver: function (driverid, carid) {
      this.sendMessage({ command: "startstream", driverid, carid });
   },
   startStreamAndControl: function (driverid, carid) {
      this.sendMessage({ command: "startstreamandcontrol", driverid, carid });
   },
   stopStreamAndControl: function (driverid) {
      this.sendMessage({ command: "stopstreamandcontrol", driverid });
   },
   stopStreamToDriver: function (driverid) {
      this.sendMessage({ command: "stopstream", driverid });
   },
   setDriverOfCar: function (driverid, carid) {
      this.sendMessage({ command: "setdriverofcar", driverid, carid });
   },
   giveControlToDriver: function (driverid, carid) {
      this.sendMessage({ command: "addcontrol", driverid, carid });
   },
   cutControlOfDriver: function (driverid) {
      this.sendMessage({ command: "removecontrol", driverid });
   },
   cutAllControls: function (raceid) {
      this.sendMessage({ command: "removeallcontrols", raceid });
   },
   cutAllStreams: function (raceid) {
      this.sendMessage({ command: "stopallstreams", raceid });
   },
   controlCar: function (carid, throttle, steering) {
      this.sendMessage({ command: "controlcar", carid, throttle, steering });
   },
   sendAnswerSdp: function (driverid, answersdp) {
      this.sendMessage({ command: "answersdp", answersdp, driverid });
   },
   sendCandidate: function (driverid, candidate) {
      this.sendMessage({ command: "candidate", candidate, driverid });
   },
   setStreamUrl: function (carid, url) {
      this.sendMessage({ command: "setstreamurl", url, carid });
   },
   
}