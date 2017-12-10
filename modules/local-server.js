//Keep all connection stuff with local server here.
var WebSocket = require('ws');

var ws = null;
var gameServer = null;

module.exports = {
   start: function (_gameServer) {
      gameServer = _gameServer;

      /* TODO: Put local server ip and port */
      ws = new WebSocket('ws://demos.kaazing.com/echo');
      //ws = new WebSocket('ws://127.0.0.1:8188', "tracer-protocol");

      ws.on('open', function open() {
         console.log('connected to local server');
         //ws.send(JSON.stringify({ command:"controlcar", carid: "mycar", throttle: "43", steering: "14" }));
         //ws.send(JSON.stringify({ command:"connecttodriver", driverid:"driverId"}));

      });

      ws.on('close', function close() {
         console.log('disconnected from local server');
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
            case 'verified':
               //Let Game Server know that driver verified his ID.
               gameServer.on_verified(request.driverid);
               break;
            case 'wrongid':
               //Let Game Server know that driver gave wrong id to Local Server via WebRTC and disconnected
               gameServer.on_wrongid(request.driverid);
               break;
         }
      });

   },
   sendMessage: function (msg) {
      if (ws.readyState == ws.OPEN){
         ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }else{
         console.log("LS connection is DOWN!");
      }
   },
   connectToDriver: function (driverid) {
      //Tell LS to establish a webRTC connection with this Driver.
      this.sendMessage({ command: "connecttodriver", driverid });
   },
   disconnectDriver: function (driverid) {
      this.sendMessage({ command: "disconnectdriver", driverid });
   },
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
   giveControlToDriver: function (driverid, carid) {
      this.sendMessage({ command: "givecontrol", driverid, carid });
   },
   cutControlOfDriver: function (driverid) {
      this.sendMessage({ command: "removecontrol", driverid });
   },
   cutAllControls: function () {
      this.sendMessage({ command: "removeallcontrols" });
   },
   cutAllStreams: function () {
      this.sendMessage({ command: "stopallstreams" });
   },
   controlCar: function (carid, throttle, steering) {
      this.sendMessage({ command: "controlcar", carid, throttle, steering });
   },
   sendAnswerSdp: function (driverId, answersdp) {
      this.sendMessage({ command: "answersdp", answersdp });
   },

}