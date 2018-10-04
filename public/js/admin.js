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
   WRONG_ROOM_PASSWORD: 8,
   SAME_USERNAME_OR_EMAIL_EXIST: 9,
   NO_TRACK_WITH_GIVEN_ID: 10,
   NO_ROOM_WITH_GIVEN_ID: 11,
   DRIVER_IS_NOT_IN_A_ROOM: 12,
   STILL_IN_RACE: 13, //If admin tries to take next room in while there is a race running on a track, we will send this reason.
   NO_READY_ROOM_IN_QUEUE: 14,
   NO_ROOM_IN_RACE: 15,
   LOCAL_SERVER_IS_DOWN: 16
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

var socket;

window.onload = function () {
   for(var i=1;i<=4;i++){
      $("txtDriverName" + i).html("EMPTY");
      $("txtDriverName" + i).data("uuid", "");
   }
   for(var i=1;i<=4;i++){
      $("txtCarName" + i).html("EMPTY");
      $("txtCarName" + i).data("uuid", "");
   }

   socket = io('/tradmin');

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

   socket.on('snapshot', (snapshot) => {
      console.log("We got a snaphot!");
      ProcessSnapshot(snapshot);
      socket.emit("getroominrace", { track_id: activeTrack.uuid }, (data) => {
         console.log("Is there any room in race? -> ");
         console.log(data);
      });
   });

   socket.on('update', (update) => {
      console.log("Got update! -> ");
      console.log(update);
      UpdateHandler[update.type](update.data);
   });

   socket.on('room_in_race', (room_in_race) => {
      console.log("Got room_in_race! -> ");
      console.log(room_in_race);
      //Put names on the list view
      for(var i=1;i<=4;i++){
         $("#txtDriverName" + i).html("EMPTY");
         $("#txtDriverName" + i).data("uuid", "");
      }
      var driverNo = 1;
      for(var driverId in room_in_race.drivers){
         $("#txtDriverName" + driverNo).html(room_in_race.drivers[driverId].username);
         $("#txtDriverName" + driverNo).data("uuid", driverId);
         driverNo++;

         if($("#txtCarName" + driverNo).data("uuid")!="")
            SetDriverOfCar(activeTrack.uuid, driverId, $("#txtCarName" + driverNo).data("uuid"));
      }
   });

   socket.on('cars', (data) => {
      console.log("Got cars! -> ");
      console.log(data);
      cars = data.cars;
      for(var i=1;i<=4;i++){
         $("#txtCarName" + i).html("EMPTY");
         $("#txtCarName" + i).data("uuid", "");
      }
      var carNo = 1;
      for(var carId in cars){
         $("#txtCarName" + carNo).html(cars[carId].name);
         $("#txtCarName" + carNo).data("uuid", carId);
         carNo++;

         if($("#txtDriverName" + carNo).data("uuid")!="")
            SetDriverOfCar(activeTrack.uuid, $("#txtDriverName" + carNo).data("uuid"), carId);
      }
   });

   //Add Button Events
   $("#imgEye1").click(function(){
      OnEyeClick(1);
   });
   $("#imgControl1").click(function(){
      OnControlClick(1);
   });
   $("#imgEye2").click(function(){
      OnEyeClick(2);
   });
   $("#imgControl2").click(function(){
      OnControlClick(2);
   });
   $("#imgEye3").click(function(){
      OnEyeClick(3);
   });
   $("#imgControl3").click(function(){
      OnControlClick(3);
   });
   $("#imgEye4").click(function(){
      OnEyeClick(4);
   });
   $("#imgControl4").click(function(){
      OnControlClick(4);
   });

   $("#btnTakeNextRoomIn").click(function(){
      TakeNextRoomIn(activeTrack.uuid);
   });
   $("#btnStartRace").click(function(){
      StartRace(activeTrack.uuid);
   });
   $("#btnPauseRace").click(function(){
      PauseRace(activeTrack.uuid);
   });
   $("#btnAbortRace").click(function(){
      AbortRace(activeTrack.uuid);
   });
}

function OnEyeClick(eyeNo){
   var driverId = $("#txtDriverName" + eyeNo).data("uuid");
   var carId = $("#txtCarName" + eyeNo).data("uuid");
   if(driverId == "" || carId == "")
      return;

   if($("#imgEye" + eyeNo).attr("src").includes("eyeOpen")){
      StopStreamToDriver(activeTrack.uuid, driverId);
      $("#imgEye" + eyeNo).attr("src", "/public/images/eyeClosed.png");
   }else{
      StartStreamToDriver(activeTrack.uuid, driverId);
      $("#imgEye" + eyeNo).attr("src", "/public/images/eyeOpen.png");
   }
}
function OnControlClick(controlNo){
   var driverId = $("#txtDriverName" + controlNo).data("uuid");
   var carId = $("#txtCarName" + controlNo).data("uuid");
   if(driverId == "" || carId == "")
      return;

   if($("#imgControl" + controlNo).attr("src").includes("controlOpen")){
      CutControlToDriver(activeTrack.uuid, driverId);
      $("#imgControl" + controlNo).attr("src", "/public/images/controlCut.png");
   }else{
      GiveControlToDriver(activeTrack.uuid, driverId);
      $("#imgControl" + controlNo).attr("src", "/public/images/controlOpen.png");
   }
   
}

var room_in_race, cars;
var trackList, activeTrack;
function ProcessSnapshot(data) {
   trackList = {};
   activeTrack = null;
   for (var track_id in data) {
      trackList[track_id] = {
         uuid: track_id,
         room_in_race: null,
         rooms: {}
      };
      for (var r in data[track_id].rooms) {
         trackList[track_id].rooms[r] = onNewRoomView(data[track_id].rooms[r]);
      }
      trackList[track_id].chat = data[track_id].chat;

      //Set the first one as active track.
      if (!activeTrack)
         changeActiveTrack(track_id);
   }
}

function changeActiveTrack(track_id) {
   if (activeTrack && track_id == activeTrack.uuid)
      return;

   activeTrack = trackList[track_id];

   ShowRoomsOfActiveTrackInOrder();

   //Empty chat area first.
   $('#divGlobalChat').empty();
   //Show Global Chat
   for (var c = 0; c < activeTrack.chat.length; c++) {
      var chatContent = '<div class="chat-line"><a href="javascript:void(0)">@' + activeTrack.chat[c].username + ':</a><span>' + activeTrack.chat[c].text + '</span></div>';
      $("#divGlobalChat").append(chatContent);
   }
   setChatAreaHeight();
}

function setChatAreaHeight() {
   $("#divGlobalChat").height($(window).height() - $("#divChatTextArea").height() - 190);
   $("#divGlobalChat").scrollTop(9999999);
   $("#divRoomChat").height($(window).height() - $("#divChatTextArea").height() - 190);
   $("#divRoomChat").scrollTop(9999999);
}

function ShowRoomsOfActiveTrackInOrder() {
   var roomList = activeTrack.rooms;
   var roomDomContainerListInOrder = [];
   for (var r1 in roomList) {
      var number = 1;
      for (var r2 in roomList) {
         if (roomList[r1].room_public_view.create_date > roomList[r2].room_public_view.create_date)
            number++;
      }
      roomList[r1].setRoomNumber(number);
      roomDomContainerListInOrder[number] = roomList[r1].domElements.container;
   }
   $("#divRoomList").empty();
   for (var r = 0; r < roomDomContainerListInOrder.length; r++) {
      if (roomDomContainerListInOrder[r]) {
         $("#divRoomList").append(roomDomContainerListInOrder[r]);
      }
   }
}

function onNewRoomView(room_public_view) {
   if (trackList[room_public_view.track_id].rooms[room_public_view.uuid]) {
      trackList[room_public_view.track_id].rooms[room_public_view.uuid].setRoomView(room_public_view);
   } else {
      var newRoom = new RoomItem(room_public_view);
      trackList[room_public_view.track_id].rooms[newRoom.room_public_view.uuid] = newRoom;
   }
   return trackList[room_public_view.track_id].rooms[room_public_view.uuid];
}

var RoomItem = function (room_public_view) {
   var _that = this;

   this.domElements = null;
   this.room_public_view = null;

   function CreateDomElements() {
      // <a href="#" class="list-group-item" style="margin-bottom: 30px;width: 880px;">
      //    <div>Room 1
      //       <div style="float:right;">
      //          <i class="fa fa-car" style="color:#ffc534;" data-toggle="tooltip" title=""
      //                data-original-title="Not Ready"></i>
      //          <i class="fa fa-car" style="color:#0acc0a;" data-toggle="tooltip" title=""
      //                data-original-title="Not Ready"></i>
      //          <i class="fa fa-car" style="color:gray;" data-toggle="tooltip" title=""
      //                data-original-title="Not Ready"></i>
      //          <i class="fa fa-car" data-toggle="tooltip" title="" data-original-title="Not Ready"></i>
      //       </div>
      //    </div>
      // </a>

      _that.domElements = {};

      _that.domElements.container = document.createElement('a');
      $(_that.domElements.container).addClass("list-group-item");
      $(_that.domElements.container).css("margin-bottom", "30");
      $(_that.domElements.container).css("width", "880px");

      var inner_container = document.createElement('div');
      $(_that.domElements.container).append(inner_container);

      _that.domElements.room_name = document.createElement('span');
      $(inner_container).append(_that.domElements.room_name);

      var car_div = document.createElement('div');
      $(car_div).css("float", "right");
      $(inner_container).append(car_div);

      for (var d = 1; d <= 4; d++) {
         _that.domElements["car_image" + d] = document.createElement('i');
         $(_that.domElements["car_image" + d]).addClass("fa fa-car");
         $(_that.domElements["car_image" + d]).attr("data-toggle", "tooltip");
         $(_that.domElements["car_image" + d]).attr("title", "");
         $(_that.domElements["car_image" + d]).attr("data-original-title", "Empty");

         $(car_div).append(_that.domElements["car_image" + d]);
      }
   }

   this.setRoomNumber = function (number) {
      $(this.domElements.room_number).text(number);
   };

   this.setDriverCount = function (driver_count) {
      var ready = 0, not_ready = 0, offline = 0;
      for (var d = 1; d <= 4; d++) {
         var carColor = "";
         var carTooltip = "";
         if (driver_count.ready > ready) {
            ready++;
            carColor = "#0acc0a";
            carTooltip = "Ready";
         } else if (driver_count.not_ready > not_ready) {
            not_ready++;
            carColor = "#ffc534";
            carTooltip = "Not Ready";
         } else {
            offline++;
            carColor = "gray";
            carTooltip = "Empty";
         }
         $(this.domElements["car_image" + d]).css("color", carColor);
         $(this.domElements["car_image" + d]).attr("data-toggle", "tooltip");
         $(this.domElements["car_image" + d]).attr("title", "");
         $(this.domElements["car_image" + d]).attr("data-original-title", carTooltip);
      }
   };

   this.setRoomView = function (room_public_view) {
      if (!this.domElements)
         CreateDomElements();

      this.room_public_view = room_public_view;

      // var room_public_view = {
      //       uuid: room.uuid,
      //       name: room.name,
      //       status: room.status,
      //       driver_count: {offline: 0, not_ready: 0, ready: 0},
      //       is_locked: room.password != null && room.password != ""
      // };

      $(this.domElements.room_name).text(room_public_view.name);

      if (room_public_view.is_locked) {
         var join_button_lock = document.createElement('div');
         $(join_button_lock).addClass("fa fa-lock");
         $(join_button_lock).attr("style", "margin-left: 6px;");
         $(this.domElements.join_button).append(join_button_lock);
      }

      $(this.domElements.join_button).attr('onClick', 'JoinRoom("' + room_public_view.uuid + '")');
      //this.domElements.join_button.addEventListener("click", function(){ JoinRoom(room_public_view.uuid); });
      //$(this.domElements.join_button).on("click", function(){ JoinRoom(room_public_view.uuid); });

      this.setDriverCount(room_public_view.driver_count);

   };
   if (room_public_view)
      this.setRoomView(room_public_view);

   return this;
};

var UpdateHandler = {};
UpdateHandler[UpdateTypes.ROOM_CREATED] = function (data) {
   //append room to the track's room list
   //data = { track_id, room_public_view }
   if (!trackList[data.room_public_view.track_id]) {
      requestNewSnapshot();
      return;
   }
   var roomItem = onNewRoomView(data.room_public_view);
   trackList[data.room_public_view.track_id].rooms[data.room_public_view.uuid] = roomItem;
   if (activeTrack.uuid == data.room_public_view.track_id) {
      ShowRoomsOfActiveTrackInOrder();
   }
};
UpdateHandler[UpdateTypes.ROOM_CLOSED] = function (data) {
   //remove room from its track's room list
   //data: { room_id }
   var room = trackList[data.track_id].rooms[data.room_id];
   if (room) {
      delete trackList[data.track_id].rooms[data.room_id];
      if (activeTrack.uuid == data.track_id) {
         ShowRoomsOfActiveTrackInOrder();
      }
   }
};
UpdateHandler[UpdateTypes.ROOM_ENTERED_RACE] = function (data) {
   //remove room from its track's room list and show it over the camera stream.
   //data: { room: Snapshot[track_id].room_in_race }
   /* room: {
         uuid: "",
         track_id,
         drivers: {
            "driveruuid1": {
               username: driver.username
            }
         },
         ranking: ["driver_uuid1", "driver_uuid2", "driver_uuid3", "driver_uuid4"]
      } */

   delete trackList[data.room.track_id].rooms[data.room.uuid];
   ShowRoomsOfActiveTrackInOrder();
};
UpdateHandler[UpdateTypes.ROOM_FINISHED_RACE] = function (data) {
   //show result of the race.
   //data: { room_id, ranking }
};
UpdateHandler[UpdateTypes.DRIVER_JOINED_ROOM] = function (data) {
   //set room driver count text
   //data: { track_id, room_id, driver_count }
   trackList[data.track_id].rooms[data.room_id].setDriverCount(data.driver_count);
};
UpdateHandler[UpdateTypes.DRIVER_LEFT_ROOM] = function (data) {
   //set room driver count text
   //data: { track_id, room_id, driver_count }
   trackList[data.track_id].rooms[data.room_id].setDriverCount(data.driver_count);
};
//These four updates will call the same function.
UpdateHandler[UpdateTypes.DRIVER_GOT_ONLINE] = function (data) {
   //Update room car slot colors with the room_view.
   //data: { track_id, room_id, driver_count }
   trackList[data.track_id].rooms[data.room_id].setDriverCount(data.driver_count);
};
UpdateHandler[UpdateTypes.DRIVER_GOT_OFFLINE] = function (data) {
   //Update room car slot colors with the room_view.
   //data: { track_id, room_id, driver_count }
   trackList[data.track_id].rooms[data.room_id].setDriverCount(data.driver_count);
};
UpdateHandler[UpdateTypes.DRIVER_IS_READY] = function (data) {
   //Update room car slot colors with the room_view.
   //data: { track_id, room_id, driver_count }
   trackList[data.track_id].rooms[data.room_id].setDriverCount(data.driver_count);
};
UpdateHandler[UpdateTypes.DRIVER_IS_NOT_READY] = function (data) {
   //Update room car slot colors with the room_view.
   //data: { track_id, room_id, driver_count }
   trackList[data.track_id].rooms[data.room_id].setDriverCount(data.driver_count);
};
UpdateHandler[UpdateTypes.GLOBAL_CHAT] = function (data) {
   console.log("Global chat ->");
   console.log(data);
   if (data.track_id && data.username && data.text) {
      trackList[data.track_id].chat.push({ username: data.username, text: data.text });
      if (activeTrack.uuid != data.track_id || driver.username == data.username)
         return;
      //Append new chat to the track with track_id
      var chatContent = '<div class="chat-line"><a href="javascript:void(0)">@' + data.username + ':</a><span>' + data.text + '</span></div>';
      $("#divGlobalChat").append(chatContent);
      setChatAreaHeight();
   }
};

function Authenticate(u, p) {
   if (!p && u) {
      //We are using token authentication
      socket.emit("authenticate", { token: u }, (data) => {
         console.log("Are we authenticated? -> ");
         console.log(data);
         if (data.success)
            GetSnapshot();
      });
   } else {
      socket.emit("authenticate", { username: u, password: p }, (data) => {
         console.log("Are we authenticated? -> ");
         console.log(data);
         if (success)
            GetSnapshot();
      });
   }
}

function GetSnapshot() {
   socket.emit("getsnapshot");
}

function TakeNextRoomIn(track_id) {
   socket.emit("takenextroomin", { track_id }, (data) => {
      console.log("Did we got room info? -> ");
      console.log(data);
      
      if(!data.success)
         return;

      activeTrack.room_in_race = data.room_private_view;
      var i=0;
      for(var driver_id in data.room_private_view.drivers){
         i++;
         $("#txtDriverName" + i).html(data.room_private_view.drivers[driver_id].username);
         $("#txtDriverName" + i).data("uuid", driver_id);
      }
   });
}

function StartRace(track_id) {
   socket.emit("startrace", { track_id }, (data) => {
      console.log("Did we start the race? -> ");
      console.log(data);
   });
}

function PauseRace(track_id) {
   socket.emit("pauserace", { track_id }, (data) => {
      console.log("Did we pause the race? -> ");
      console.log(data);
   });
}

function AbortRace(track_id) {
   socket.emit("abortrace", { track_id }, (data) => {
      console.log("Did we abort the race? -> ");
      console.log(data);
   });
}

function KickDriverOut(race_id, driver_id) {
   socket.emit("kick-driver-out", { race_id, driver_id }, (data) => {
      console.log("Did we send chat to the room? -> ");
      console.log(data);
   });
}

function StartAllStreams(chat) {
   socket.emit("start-all-streams", { track_id }, (data) => {
      console.log("Did we send chat to everyone? -> ");
      console.log(data);
   });
}

function ConnectToDriverModified(driver_id) {
   socket.emit("connecttodrivermodified", { driver_id }, (data) => {
      console.log("Did we connect to driver : ? -> " + driver_id);
      console.log(data);
   });
}

function Watch(track_id, driver_id) {
   socket.emit("watch", { track_id, driver_id }, (data) => {
      console.log("Did we start watching : ? -> " + driver_id);
      console.log(data);
   });
}

function SetDriverOfCar(track_id, driver_id, car_id) {
   socket.emit("setdriverofcar", { track_id, driver_id, car_id }, (data) => {
      console.log("Did we set driver of car : ? -> " + driver_id + " - " + car_id);
      console.log(data);
   });
}

function StartRecording(driver_id) {
   socket.emit("startrecording", { driver_id }, (data) => {
      console.log("Did we start recording : ? -> " + driver_id);
      console.log(data);
   });
}

function StopRecording(driver_id) {
   socket.emit("stoprecording", { driver_id }, (data) => {
      console.log("Did we stop recording : ? -> " + driver_id);
      console.log(data);
   });
}

function StartToDriverModified(driver_id) {
   socket.emit("streamtodrivermodified", { driver_id }, (data) => {
      console.log("Did we start stream to driver : ? -> " + driver_id);
      console.log(data);
   });
}

function StartStreamToDriver(track_id, driver_id) {
   socket.emit("streamtodriver", { track_id, driver_id }, (data) => {
      console.log("Did we start stream to driver : ? -> " + driver_id);
      console.log(data);
   });
}

function StopStreamToDriver(track_id, driver_id) {
   socket.emit("stopstream", { track_id, driver_id }, (data) => {
      console.log("Did we stop stream to driver : ? -> " + driver_id);
      console.log(data);
   });
}

function GiveControlToDriver(track_id, driver_id) {
   socket.emit("givecontrol", { track_id, driver_id }, (data) => {
      console.log("Did we give control to driver : ? -> " + driver_id);
      console.log(data);
   });
}

function CutControlToDriver(track_id, driver_id) {
   socket.emit("cutcontrol", { track_id, driver_id }, (data) => {
      console.log("Did we cut control to driver : ? -> " + driver_id);
      console.log(data);
   });
}

