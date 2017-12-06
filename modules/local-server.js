//Keep all connection stuff with local server here.
var WebSocket = require('ws');

var ws = null; 
var gameServer = null;

module.exports = {
   start: function(_gameServer){
   gameServer = _gameServer;

   /* TODO: Put local server ip and port */ 
   ws = new WebSocket('ws://demos.kaazing.com/echo');
   //ws = new WebSocket('ws://127.0.0.1:8188', "tracer-protocol");
   
   ws.on('open', function open() {
      console.log('connected to local server');
      //ws.send(JSON.stringify({ command:"controlcar", carid: "mycar", throttle: "43", steering: "14" }));
      ws.send(JSON.stringify({ command:"connecttodriver", driverid:"driverId"}));
      
   });

   ws.on('close', function close() {
      console.log('disconnected from local server');
   });

   ws.on('message', function incoming(data) {
      var request = JSON.parse(data);

      switch(request.info){
         case 'offer':
         //Send sdp to game server with driverId
         gameServer.on_offer(request.driverid, request.sdp);
         break;
         case 'webrctup':
         //Let Game Server know that driver connected to Local Server via WebRTC
         gameServer.on_webrctup(request.driverid);
         break;
         case 'wrongid':
         //Let Game Server know that driver gave wrong id to Local Server via WebRTC and disconnected
         gameServer.on_wrongid(request.driverid);
         break;
      }
   });

   },
   sendMessage: function(msg){
      if(ws.readyState == ws.OPEN)
         ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
   },
   connectToDriver: function(driverId){
      //Send a connect request with driverId to the local server
      this.sendMessage({ command:"connecttodriver", driverid:driverId});
   },
   disconnectDriver: function(driverId){
      this.sendMessage({ command:"disconnectdriver", driverid:driverId });
   },
   streamToDriver: function(driverId, carId){
      this.sendMessage({ command:"startstream", driverid:driverId, carid:carId });
   },
   startStreamAndControl: function(driverId, carId){
      this.sendMessage({ command:"startstreamandcontrol", driverid:driverId, carid:carId });
   },
   stopStreamAndControl: function(driverId){
      this.sendMessage({ command:"stopstreamandcontrol", driverid:driverId });
   },
   stopStreamToDriver: function(driverId){
      this.sendMessage({ command:"stopstream", driverid:driverId });
   },
   giveControlToDriver: function(driverId, carId){
      this.sendMessage({ command:"givecontrol", driverid:driverId, carid:carId });
   },
   cutControlOfDriver: function(driverId){
      this.sendMessage({ command:"removecontrol", driverid:driverId });
   },
   cutAllControls: function(){
      this.sendMessage({ command:"removeallcontrols" });
   },
   cutAllStreams: function(){
      this.sendMessage({ command:"stopallstreams" });
   },
   controlCar: function(carId){
      this.sendMessage({ command:"controlcar", carid: "mycar", throttle: "43", steering: "14" });
   },
   sendAnswerSdp: function(driverId, answerSdp){
      this.sendMessage({ command:"answersdp", answersdp:answerSdp });
   },

}