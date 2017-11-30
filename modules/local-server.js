//Keep all connection stuff with local server here.
var WebSocket = require('ws');

var ws = null; 
var gameServer = null;

module.exports = {
   start: function(_gameServer){
   gameServer = _gameServer;

   /* TODO: Put local server ip and port */ 
   ws = new WebSocket('ws://demos.kaazing.com/echo');
   
   ws.on('open', function open() {
      console.log('connected to local server');
      ws.send(JSON.stringify({a: 4}));
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
         ws.send(msg);
   },
   connectToDriver: function(driverId){
   //Send a connect request with driverId to the local server
   },
   cutConnectionToDriver: function(driverId){

   },
   streamToDriver: function(driverId, carId){

   },
   startStreamAndControl: function(driverId, carId){

   },
   stopStreamAndControl: function(driverId){

   },
   cutStreamToDriver: function(driverId){

   },
   giveControlToDriver: function(driverId, carId){

   },
   cutControlOfDriver: function(driverId){

   },
   cutAllControls: function(){

   },
   cutAllStreams: function(){

   },
   controlCar: function(carId){

   },
   sendAnswerSdp: function(driverId, answerSdp){

   },

}