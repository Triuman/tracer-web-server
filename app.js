"use strict";

var http = require('http');
var express = require('express'),
   app = express();
var httpServer = http.createServer(app);
var ejs = require('ejs');
var WebSocket = require('ws');
var path = require('path');

//Custom Modules
var gameServer = require('./modules/game-server');

gameServer.start(httpServer);

// set the view engine to ejs
app.set('view engine', 'ejs');

//open pulic folder to public access
app.use('/public', express.static(path.join(__dirname, 'public')));

// index page 
app.get('/', function(req, res) {
   res.render('index');
});

// about page 
app.get('/about', function(req, res) {
   res.render('about');
});

//start web server 
httpServer.listen(process.env.PORT || 8080);  //listen on port 80