"use strict";


//To prevent Threejs getInverse warnings.
console.warn = function () { };

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

var driver = null; //This is DriverPrivateModel
var my_room_view = null; //RoomPrivateModel
var trackList = {};
var activeTrack = null;

var RoomItem = function (room_public_view) {
   var _that = this;

   this.domElements = null;
   this.room_public_view = null;

   function CreateDomElements() {
      // <div class="room-line">
      //       <div id="divRoomNumber" class="rm1">1</div>
      //       <div class="rm2">
      //           <h3 id="divRoomName">Room-1</h3>
      //           <a href="" class="btn btn-warning">Join</a>
      //           <span>
      //               <i id="listCarIcon1" title="" data-toggle="tooltip" class="fa fa-car active" data-original-title="Ready"></i>
      //               <i id="listCarIcon2"  title="" data-toggle="tooltip" class="fa fa-car pause" data-original-title="Not Ready"></i>
      //               <i id="listCarIcon3"  title="" data-toggle="tooltip" class="fa fa-car passive" data-original-title="Empty"></i>
      //               <i id="listCarIcon4"  title="" data-toggle="tooltip" class="fa fa-car passive" data-original-title="Empty"></i>
      //           </span>
      //       </div>
      //   </div>

      _that.domElements = {};

      _that.domElements.container = document.createElement('div');
      $(_that.domElements.container).addClass("room-line");

      _that.domElements.room_number = document.createElement('div');
      $(_that.domElements.room_number).addClass("rm1");
      $(_that.domElements.container).append(_that.domElements.room_number);

      var inner_container = document.createElement('div');
      $(inner_container).addClass("rm2");
      $(_that.domElements.container).append(inner_container);

      _that.domElements.room_name = document.createElement('h3');
      $(inner_container).append(_that.domElements.room_name);

      _that.domElements.join_button = document.createElement('a');
      $(_that.domElements.join_button).append("join");
      $(_that.domElements.join_button).addClass("btn btn-warning");
      $(inner_container).append(_that.domElements.join_button);

      var span = document.createElement('span');
      $(inner_container).append(span);

      for (var d = 1; d <= 4; d++) {
         _that.domElements["car_image" + d] = document.createElement('i');
         $(_that.domElements["car_image" + d]).addClass("fa fa-car passive");
         $(_that.domElements["car_image" + d]).attr("data-toggle", "tooltip");
         $(_that.domElements["car_image" + d]).attr("title", "");
         $(_that.domElements["car_image" + d]).attr("data-original-title", "Empty");

         $(span).append(_that.domElements["car_image" + d]);
      }
   }

   this.setRoomNumber = function (number) {
      $(this.domElements.room_number).text(number);
   };

   this.setDriverCount = function (driver_count) {
      var ready = 0, not_ready = 0, offline = 0;
      for (var d = 1; d <= 4; d++) {
         var carClass = "";
         var carTooltip = "";
         if (driver_count.ready > ready) {
            ready++;
            carClass = "active";
            carTooltip = "Ready";
         } else if (driver_count.not_ready > not_ready) {
            not_ready++;
            carClass = "pause";
            carTooltip = "Not Ready";
         } else {
            offline++;
            carClass = "passive";
            carTooltip = "Empty";
         }
         $(this.domElements["car_image" + d]).removeClass().addClass("fa fa-car " + carClass);
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
      if (my_room_view && roomList[r1].room_public_view.uuid == my_room_view.uuid) {
         //this is our room. Set its number too.
         $("#divRoomNumber").text(number);
      }
      roomDomContainerListInOrder[number] = roomList[r1].domElements.container;
   }
   $("#divRoomList").empty();
   for (var r = 0; r < roomDomContainerListInOrder.length; r++) {
      if (roomDomContainerListInOrder[r]) {
         $("#divRoomList").append(roomDomContainerListInOrder[r]);
      }
   }

   if (my_room_view)
      hideJoinButtons();
   else
      showJoinButtons();
}

function hideJoinButtons() {
   for (var r in activeTrack.rooms) {
      $(activeTrack.rooms[r].domElements.join_button).hide();
   }
}
function showJoinButtons() {
   for (var r in activeTrack.rooms) {
      $(activeTrack.rooms[r].domElements.join_button).show();
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

var socket;
function StartSocket() {
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


   socket.on('authenticate', (data) => {
      onAuthenticate(data);
   });

   socket.on('snapshot', (data) => {
      console.log("Got a snapshot -> ");
      console.log(data);
      trackList = {};
      activeTrack = null;
      for (var track_id in data) {
         trackList[track_id] = {
            uuid: track_id,
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

   });

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

   socket.on('room-snapshot', (data) => {
      console.log("Got a room snapshot -> ");
      console.log(data);
      ProcessRoomSnapshot(data.room_private_view);
   });



   socket.on('offer', (data) => {
      console.log("Got offer! -> ", data.sdp);
      // TODO: Remove the line below.
      my_room_view = { track_id: data.track_id };
      if (data.isleft)
         WebRTCConnection.setOfferLeft(data.sdp);
      else
         WebRTCConnection.setOfferRight(data.sdp);
   });

   socket.on('room-update', (update) => {
      console.log("Got room update! -> ");
      console.log(update);
      RoomUpdateHandler[update.type](update.data);
   });

   function requestNewSnapshot() {
      socket.emit("getsnapshot");
   }

   function requestNewRoomSnapshot() {
      socket.emit("room-snapshot", {}, function (data) {
         if (data.success) {
            ProcessRoomSnapshot(data.room_private_view);
         } else {
            my_room_view = null;
            SwitchToNoInRoomView();
            console.log("Error while getting room snapshot.");
            switch (data.reason) {
               case Enum_Callback_Reason.NOT_LOGGED_IN:
                  console.log("Reason.NOT_LOGGED_IN");
                  break;
               case Enum_Callback_Reason.DRIVER_IS_NOT_IN_A_ROOM:
                  console.log("Reason.DRIVER_IS_NOT_IN_A_ROOM");
                  break;
            }
         }
      });
   }


   function requestNewDriverView() {
      socket.emit("driver-view", {}, function (data) {
         if (data.success) {
            my_room_view.drivers[data.driver_view.uuid] = data.driver_view;
            ProcessRoomSnapshot(my_room_view);
         } else {
            console.log("Error while getting room snapshot.");
            switch (data.reason) {
               case Enum_Callback_Reason.NOT_LOGGED_IN:
                  console.log("Reason.NOT_LOGGED_IN");
                  my_room_view = null;
                  SwitchToNoInRoomView();
                  break;
               case Enum_Callback_Reason.DRIVER_IS_NOT_IN_A_ROOM:
                  console.log("Reason.DRIVER_IS_NOT_IN_A_ROOM");
                  my_room_view = null;
                  SwitchToNoInRoomView();
                  break;
            }
         }
      });
   }

   var RoomUpdateHandler = {};
   RoomUpdateHandler[UpdateTypes.DRIVER_JOINED_ROOM] = function (data) {
      //put driver to next empty slot
      //data: {  driver_view }
      if (!my_room_view) {
         requestNewRoomSnapshot();
         return;
      }
      my_room_view.drivers[data.driver_view.uuid] = data.driver_view;
      ProcessRoomSnapshot(my_room_view);
   };
   RoomUpdateHandler[UpdateTypes.DRIVER_LEFT_ROOM] = function (data) {
      //remove driver from the slot
      //data: {  driver_id }
      if (!my_room_view) {
         requestNewRoomSnapshot();
         return;
      }
      delete my_room_view.drivers[data.driver_id];
      ProcessRoomSnapshot(my_room_view);
   };
   RoomUpdateHandler[UpdateTypes.DRIVER_GOT_ONLINE] = function (data) {
      //change slot to online/not ready view
      //data: {  driver_id }
      if (!my_room_view) {
         requestNewRoomSnapshot();
         return;
      }
      if (!my_room_view.drivers[data.driver_id]) {
         requestNewDriverView();
         return;
      }
      my_room_view.drivers[data.driver_id].status = Enum_Driver_Room_Status.NOT_READY;
      ProcessRoomSnapshot(my_room_view);
   };
   RoomUpdateHandler[UpdateTypes.DRIVER_GOT_OFFLINE] = function (data) {
      //change slot to offline view
      //data: {  driver_id }
      if (!my_room_view) {
         requestNewRoomSnapshot();
         return;
      }
      if (!my_room_view.drivers[data.driver_id]) {
         requestNewDriverView();
         return;
      }
      my_room_view.drivers[data.driver_id].status = Enum_Driver_Room_Status.OFFLINE;
      ProcessRoomSnapshot(my_room_view);
   };
   RoomUpdateHandler[UpdateTypes.DRIVER_IS_READY] = function (data) {
      //set driver's slot to green
      //data: {  driver_id }
      if (!my_room_view) {
         requestNewRoomSnapshot();
         return;
      }
      if (!my_room_view.drivers[data.driver_id]) {
         requestNewDriverView();
         return;
      }
      my_room_view.drivers[data.driver_id].status = Enum_Driver_Room_Status.READY;
      ProcessRoomSnapshot(my_room_view);
   };
   RoomUpdateHandler[UpdateTypes.DRIVER_IS_NOT_READY] = function (data) {
      //set driver's slot to yellow
      //data: {  driver_id }
      if (!my_room_view) {
         requestNewRoomSnapshot();
         return;
      }
      if (!my_room_view.drivers[data.driver_id]) {
         requestNewDriverView();
         return;
      }
      my_room_view.drivers[data.driver_id].status = Enum_Driver_Room_Status.NOT_READY;
      ProcessRoomSnapshot(my_room_view);
   };
   RoomUpdateHandler[UpdateTypes.ADMIN_CHANGED] = function (data) {
      //if this is admin, let him see kick buttons. Now he is able to kick other drivers.
      //data: {  driver_id }
      if (!my_room_view) {
         requestNewRoomSnapshot();
         return;
      }
      if (!my_room_view.drivers[data.driver_id]) {
         requestNewDriverView();
         return;
      }
      my_room_view.admin_id = data.driver_id;
      if (driver.uuid == my_room_view.admin_id) {
         //TODO: Show some menus to remove drivers from the room.
         console.log("I am now Admin!");
      } else {
         //TODO: Hide those menus.
         console.log("Admin is changed. But it is not me.");
      }
   };
   RoomUpdateHandler[UpdateTypes.ROOM_CHAT] = function (data) {
      console.log("Room chat ->");
      console.log(data);
      if (!my_room_view) {
         requestNewRoomSnapshot();
         return;
      }

      my_room_view.chat.push(data);

      if (data.username == driver.username)
         return;

      var chatContent = '<div class="chat-line"><a href="javascript:void(0)">@' + data.username + ':</a><span>' + data.text + '</span></div>';
      $("#divRoomChat").append(chatContent);
      setChatAreaHeight();
   };

   //TODO: If you cannot find a track or room or driver with the given id on updates, there is an inconsistency. So, request a new snapshot from the Web Server to catch up.
   socket.on('update', (update) => {
      console.log("Got update! -> ");
      console.log(update);
      UpdateHandler[update.type](update.data);
   });

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

};

function AddButtonEvents() {
   //Add Button Events
   $('#btnLogin').on('click', function () {
      Authenticate($('#txtLoginEmail').val(), $('#txtLoginPassword').val());
      $('#modalLogin').modal('hide');
   });

   $('#btnRegister').on('click', function () {
      Register($('#txtRegisterUsername').val(), $('#txtRegisterPassword').val(), $('#txtRegisterEmail').val());
      $('#modalRegister').modal('hide');
   });

   $('#btnLogout').on('click', function () {
      Logout();
   });

   $('#btnCreateRoom').on('click', function () {
      if ($('#txtRoomName').val() == "")
         return;
      CreateRoom($('#txtRoomName').val(), $('#txtRoomPassword').val(), activeTrack.uuid);
      $('#modalCreateRoom').modal('hide');
   });

   $('#btnLeaveRoom').on('click', function () {
      if ($('#btnLeaveRoom').text() == "Are you sure?")
         LeaveRoom();
      $('#btnLeaveRoom').text("Are you sure?");
   });
   $('#btnLeaveRoom').mouseleave(function () {
      $('#btnLeaveRoom').text("Leave Room");
   });

   $('#btnReady').on('click', function () {
      SetReady();
   });

   $('#btnJoinRoom').on('click', function () {
      var password = $('#txtJoinRoomPassword').val();
      if (password == "")
         return;
      JoinRoom(roomIdToEnterPassword, password);
   });

   $('#btnGlobalChat').on('click', function () {
      $('#btnGlobalChat').removeClass().addClass("active");
      $('#btnRoomChat').removeClass();
      $('#divGlobalChat').show();
      $('#divRoomChat').hide();
      setChatAreaHeight();
   });

   $('#btnRoomChat').on('click', function () {
      $('#btnGlobalChat').removeClass();
      $('#btnRoomChat').removeClass().addClass("active");
      $('#divGlobalChat').hide();
      $('#divRoomChat').show();
      setChatAreaHeight();
   });

   $('#btnSendChat').on('click', function () {
      onSendChatClick();
   });

   $("#txtChat").keydown(function (e) {
      if (e.keyCode === 13 && e.ctrlKey) {
         //console.log("enterKeyDown+ctrl");
         $(this).val(function (i, val) {
            return val + "\n";
         });
         $("#txtChat").trigger("input");
      }
   }).keypress(function (event) {
      if (event.which == 13 && !event.ctrlKey) {
         event.preventDefault();
         onSendChatClick();
      }
   });

   function onSendChatClick() {
      var text = $('#txtChat').val();
      if (!driver || text == "")
         return;
      if ($('#btnGlobalChat').attr('class') == "active") {
         activeTrack.chat.push({ username: driver.username, text });
         var chatContent = '<div class="chat-line"><a href="javascript:void(0)">@' + driver.username + ':</a><span>' + text + '</span></div>';
         $("#divGlobalChat").append(chatContent);
         SendGlobalChat(text);
      } else {
         if (!my_room_view)
            return;
         my_room_view.chat.push({ username: driver.username, text });
         var chatContent = '<div class="chat-line"><a href="javascript:void(0)">@' + driver.username + ':</a><span>' + text + '</span></div>';
         $("#divRoomChat").append(chatContent);
         SendRoomChat(text);
      }
      $('#txtChat').val("");
      $("#txtChat").trigger("input");
      setChatAreaHeight();
   }

   $('#txtChat').on('input', function () {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
      setChatAreaHeight();
   });

   $(window).resize(function () {
      setChatAreaHeight();
   });

}

function setChatAreaHeight() {
   $("#divGlobalChat").height($(window).height() - $("#divChatTextArea").height() - 190);
   $("#divGlobalChat").scrollTop(9999999);
   $("#divRoomChat").height($(window).height() - $("#divChatTextArea").height() - 190);
   $("#divRoomChat").scrollTop(9999999);
}

function ProcessRoomSnapshot(room_private_view) {
   /* room_private_view = {
         uuid: room.uuid,
         name: room.name,
         status: room.status,
         drivers: {
               driveruuid1:{
                     status,
                     username,
                     bronze_medal,
                     silver_medal,
                     gold_medal
               }
         },
         is_locked: room.password != null
   } */

   hideJoinButtons();

   my_room_view = room_private_view;

   if (trackList[my_room_view.track_id].rooms[my_room_view.uuid]) {
      var number = $(trackList[my_room_view.track_id].rooms[my_room_view.uuid].domElements.room_number).text();
      $("#divRoomNumber").text(number);
   } else {
      //Our room must be in race. So dont show any room number.
      $("#divRoomNumber").text("");
   }

   $('#divRoomName').text(my_room_view.name);
   var driver_no = 0;
   for (var driver_uuid in my_room_view.drivers) {
      driver_no++;
      $('#divDriverUsername' + driver_no).text(my_room_view.drivers[driver_uuid].username);
      $('#divDriverRoomStatus' + driver_no).removeClass().addClass(my_room_view.drivers[driver_uuid].status == Enum_Driver_Room_Status.OFFLINE ? "offline" : my_room_view.drivers[driver_uuid].status == Enum_Driver_Room_Status.READY ? "ready" : "not-ready");
      $('#divDriverBronzTrophy' + driver_no).text(my_room_view.drivers[driver_uuid].bronze_medal);
      $('#divDriverSilverTrophy' + driver_no).text(my_room_view.drivers[driver_uuid].silver_medal);
      $('#divDriverGoldTrophy' + driver_no).text(my_room_view.drivers[driver_uuid].gold_medal);
      $('#divDriverTrophy' + driver_no).css('visibility', 'visible');
   }
   for (var i = driver_no + 1; i <= 4; i++) {
      //Make empty remaining slots
      $('#divDriverUsername' + i).text("empty");
      $('#divDriverRoomStatus' + i).removeClass().addClass("offline");
      $('#divDriverBronzTrophy' + i).text(0);
      $('#divDriverSilverTrophy' + i).text(0);
      $('#divDriverGoldTrophy' + i).text(0);

      $('#divDriverTrophy' + i).css('visibility', 'collapse');
   }
   $('#divRoom').show();

   //Empty chat area first.
   $('#divRoomChat').empty();
   //Show Room Chat
   for (var c = 0; c < my_room_view.chat.length; c++) {
      var chatContent = '<div class="chat-line"><a href="javascript:void(0)">@' + my_room_view.chat[c].username + ':</a><span>' + my_room_view.chat[c].text + '</span></div>';
      $("#divRoomChat").append(chatContent);
   }
   setChatAreaHeight();

   if (driver.uuid == my_room_view.admin_id) {
      //TODO: Show some menus to remove drivers from the room.
      console.log("I am now Admin!");
   } else {
      //TODO: Hide those menus.
      console.log("Admin is changed. But it is not me.");
   }
}

function SetReady() {
   if ($('#btnReady').text() == "I'm Ready") {
      //we tell web server that we are ready to race.
      socket.emit("ready", function (data) {
         if (data.success) {
            //set "Set Ready" button to "Not Ready"
            //TODO: Change button's color
            $('#btnReady').text("I'm Not Ready");
         } else {

         }
      });
   } else {
      //we tell web server that we are ready to race.
      socket.emit("notready", function (data) {
         if (data.success) {
            //set "Set Not Ready" button to "I'm Ready"
            //TODO: Change button's color
            $('#btnReady').text("I'm Ready");
         } else {

         }
      });
   }
}


function Register(u, p, e) {
   socket.emit("register", { username: u, password: p, email: e }, (data) => {
      console.log("Are we Registered? -> ");
      onAuthenticate(data);
   });
}

function SendAnswer(sdp, isleft) {
   socket.emit("answer", { track_id: my_room_view.track_id, sdp, isleft }, (data) => {
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

function SendIceCandidate(candidate, isleft) {
   socket.emit("candidate", { track_id: my_room_view.track_id, candidate, isleft }, (data) => {
      console.log("Did we send candidate? -> " + (isleft?"left":"right"));
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
   driver = null;
   my_room_view = null;
   localStorage.removeItem("token"); //Even if log out fails, we log out from here anyways.
   //TODO: And do some other stuff.
   SwitchToLoggedOutView();
}

function Authenticate(u, p) {
   if (!p && u) {
      console.log("We are using token authentication. ->");
      console.log(u);
      socket.emit("authenticate", { token: u }, (data) => {
         console.log("Authentication response -> ");
         console.log(data);
         if (!data.success) {
            //remove token from the local storage
            localStorage.removeItem("token");
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
                  break;
               case Enum_Callback_Reason.WRONG_CREDENTIALS:
                  console.log("WRONG_CREDENTIALS");
                  break;
               case Enum_Callback_Reason.MISSING_INFO:
                  console.log("MISSING_INFO");
                  break;
            }
         }
      });
   } else {
      socket.emit("authenticate", { username: u, password: p }, (data) => {
         console.log("Authentication response -> ");
         console.log(data);
         if (!data.success) {
            //remove token from the local storage
            localStorage.removeItem("token");
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
                  break;
               case Enum_Callback_Reason.WRONG_CREDENTIALS:
                  console.log("WRONG_CREDENTIALS");
                  break;
               case Enum_Callback_Reason.MISSING_INFO:
                  console.log("MISSING_INFO");
                  break;
            }
         }
      });
   }
}

function UpdateDriverView(driver) {
   $('#divUsername').text(driver.username);
   $('#divCoin').text(driver.coin);
   $('#divGoldTrophy').text(driver.gold_medal);
   $('#divSilverTrophy').text(driver.silver_medal);
   $('#divBronzTrophy').text(driver.bronze_medal);
   $('.premium').hide();
   $('.profile').show();
   $('#divTrophy').show();
   $('#modalLogin').modal('hide');
   $('#modalRegister').modal('hide');
}

function SwitchToLoggedOutView() {
   $('.premium').show();
   $('.profile').hide();
   $('#divTrophy').hide();
   SwitchToNoInRoomView();
}


function SwitchToNoInRoomView() {
   $('#divRoom').hide();
   $('#divRoomChat').empty();
   setChatAreaHeight();
   showJoinButtons();
}

function onAuthenticate(data) {
   console.log("Are we authenticated? -> ");
   console.log(data);
   driver = data.driver;
   localStorage.setItem("token", data.token);
   UpdateDriverView(driver);
   if (!driver.in_room) {
      my_room_view = null;
      SwitchToNoInRoomView();
   }
}

function CreateRoom(name, password, track_id) {
   socket.emit("create-room", { name, password, track_id }, (data) => {
      console.log("Did we got a new room? -> ");
      console.log(data);
      if (data.success == false) {
         switch (data.reason) {
            case Enum_Callback_Reason.MISSING_INFO:
               break;
         }
      } else {
         ProcessRoomSnapshot(data.room_private_view);
      }
   });
}

var roomIdToEnterPassword = null;
function JoinRoom(room_id, password) {
   if (!driver) {
      alert("Sign in to join rooms.");
      return;
   }
   if (activeTrack.rooms[room_id].room_public_view.is_locked && !password) {
      roomIdToEnterPassword = room_id;
      $('#modalRoomPassword').modal('show');
      return;
   }
   socket.emit("join-room", { room_id, password }, (data) => {
      console.log("Did we join to the room? -> ");
      console.log(data);
      if (data.success == false) {
         switch (data.reason) {
            case Enum_Callback_Reason.MISSING_INFO:
               break;
         }
      } else {
         $('#modalRoomPassword').modal('hide');
         ProcessRoomSnapshot(data.room_private_view);
      }
   });
}

function LeaveRoom() {
   socket.emit("leave-room", {}, (data) => {
      console.log("Did we leave the room? -> ");
      console.log(data);
      if (data.success == false) {
         console.log("We have a problem.");
      } else {
         //Hide room view.
         my_room_view = null;
         SwitchToNoInRoomView();
      }
   });
}

function SendRoomChat(text) {
   socket.emit("room-chat", { text }, (data) => {
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

function SendGlobalChat(text) {
   socket.emit("global-chat", { track_id: activeTrack.uuid, text }, (data) => {
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


var currentLeftRightValue = 0;
var currentLeftForwardBackward = 0;

var addKeyEvents = function () {
   document.onkeydown = function (e) {
      switch (e.keyCode) {
         case 65: //a
            currentLeftRightValue = +40;
            break;
         case 68: //d
            currentLeftRightValue = -40;
            break;
         case 87: //w
            currentLeftForwardBackward = +40;
            break;
         case 83: //s
            currentLeftForwardBackward = -40;
            break;
         default:
      }
      sendCommandToCar();
   };

   document.onkeyup = function (e) {
      switch (e.keyCode) {
         case 65: //a
            currentLeftRightValue = 0;
            break;
         case 68: //d
            currentLeftRightValue = 0;
            break;
         case 87: //w
            currentLeftForwardBackward = 0;
            break;
         case 83: //s
            currentLeftForwardBackward = 0;
            break;
         default:
      }
      sendCommandToCar();
   };


   var remoteViewLeft = document.getElementById("remoteViewLeft");

   remoteViewLeft.onkeydown = document.onkeydown;
   remoteViewLeft.onkeyup = document.onkeyup;
};

var removeKeyEvents = function () {
   document.onkeydown = function (e) {
   };

   document.onkeyup = function (e) {
   };
};


var lastCommand = "";
function sendCommandToCar() {
   var oldDir = lastCommand;
   lastCommand = "1" + (currentLeftRightValue + 50) + (currentLeftForwardBackward + 50);
   if (lastCommand != oldDir) {
      WebRTCConnection.sendDataChannelMessage(lastCommand);
   }
}

var WebRTCConnection = new function () {
   var pcLeft, pcRight;
   var dataChannel;
   var configuration = {
      "iceServers": [{ "urls": ['stun:stun.l.google.com:19302',
                                 'stun:stun1.l.google.com:19302',
                                 'stun:stun2.l.google.com:19302',
                                 'stun:stun3.l.google.com:19302',
                                 'stun:stun4.l.google.com:19302'] }]
   };


   function gotLocalDescriptionLeft(desc) {
      pcLeft.setLocalDescription(desc);
      SendAnswer(desc, true);
   }
   function failedLocalDescriptionLeft(desc) {
      console.log("Couldnt create answer LEFT.");
   }

   function gotLocalDescriptionRight(desc) {
      pcRight.setLocalDescription(desc);
      SendAnswer(desc, false);
   }
   function failedLocalDescriptionRight(desc) {
      console.log("Couldnt create answer RIGHT.");
   }

   return {
      sendDataChannelMessage: function (msg) {
         console.log("sending datachannel message");
         console.log(msg);
         if (dataChannel && msg)
            dataChannel.send(msg);
         else
            console.log("Data channel or message is NULL");
      },
      setOfferLeft: function (sdp) {
         //Each time we get a new offer, we create a new RTCPeerConnection.

         if (pcLeft)
            pcLeft.close();
         pcLeft = new RTCPeerConnection(configuration);

         // send any ice candidates to the other peer
         pcLeft.onicecandidate = function (evt) {
            console.log("We got a left candidate!");
            SendIceCandidate(evt.candidate, true);
         };

         // once remote stream arrives, show it in the remote video element
         pcLeft.ontrack = function (event) {
            console.log("We got left remote stream!!");
            try {
               document.getElementById("remoteViewLeft").srcObject = event.streams[0];
            } catch (err) {
               document.getElementById("remoteViewLeft").src = URL.createObjectURL(event.streams[0]);
            }
         };


         pcLeft.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp })).then(function () {
            pcLeft.createAnswer(gotLocalDescriptionLeft, failedLocalDescriptionLeft);
         });

         var dataChannelOptions = {
            ordered: false, // do not guarantee order
            maxRetransmitTime: 10, // in milliseconds
         };
         if (dataChannel)
            dataChannel.close();
         dataChannel = pcLeft.createDataChannel("mychannel", dataChannelOptions);

         dataChannel.onerror = function (error) {
            console.log("Data Channel Error:", error);
         };

         var localCameraStreamDelay = 250; //ms
         dataChannel.onmessage = function (event) {
            console.log("Got Data Channel Message:", event.data);
            if (event.data[0] == "2") {
               //We got a camera servo control message. No we can rotate our Sphere to match the camera positions.
               //WebRTCConnection.sendDataChannelMessage("2" + Math.floor(-pose * 50 + 50));
               //We are simulating the camera latency.
               setTimeout(function () {
                  var pose = (parseInt(event.data[1] + event.data[2]) - 50) / -50;
                  StartVR.rotateGeometries(pose * Math.PI / 2 * 1.4);
               }, localCameraStreamDelay);
            }
         };

         dataChannel.onopen = function () {
            console.log("The Data Channel is Open!");
            dataChannel.send("0" + driver.uuid);
            addKeyEvents();
         };

         dataChannel.onclose = function () {
            console.log("The Data Channel is Closed");
            removeKeyEvents();
         };


      },
      setOfferRight: function (sdp) {
         //Each time we get a new offer, we create a new RTCPeerConnection.

         if (pcRight)
            pcRight.close();
         pcRight = new RTCPeerConnection(configuration);

         // send any ice candidates to the other peer
         pcRight.onicecandidate = function (evt) {
            console.log("We got a right candidate!");
            SendIceCandidate(evt.candidate, false);
         };

         // once remote stream arrives, show it in the remote video element
         pcRight.ontrack = function (event) {
            console.log("We got right remote stream!!");
            try {
               document.getElementById("remoteViewRight").srcObject = event.streams[0];
            } catch (err) {
               document.getElementById("remoteViewRight").src = URL.createObjectURL(event.streams[0]);
            }
         };


         pcRight.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp })).then(function () {
            pcRight.createAnswer(gotLocalDescriptionRight, failedLocalDescriptionRight);
         });

      },
      setIceCandidateLeft: function (candidate) {
         pcLeft.addIceCandidate(new RTCIceCandidate(candidate));
      },
      setIceCandidateRight: function (candidate) {
         pcRight.addIceCandidate(new RTCIceCandidate(candidate));
      }
   };
};


function AddVREventListeners() {
   window.addEventListener('vrdisplayconnect', function () {
      info.textContent = 'Display connected.';
      reportDisplays();
   });
}


var StartVR = new function () {

   var scene = new THREE.Scene();
   var fov = 90;
   var aspectRatio = window.innerWidth / window.innerHeight;
   var near = 1;
   var far = 1000;
   var width = 1000, height = 800;
   var camera = new THREE.PerspectiveCamera(fov, aspectRatio, near, far);
   var renderer;
   var videoleft, textureleft;
   var videoright, textureright;
   var geometryleft, materialleft, meshleft;
   var geometryright, meshright, materialright;


   this.init = function () {
      camera.position.set(0, 0, 0);
      camera.layers.enable(1); // render left view when no stereo available

      renderer = new THREE.WebGLRenderer();
      renderer.vr.enabled = true;
      renderer.vr.userHeight = 0; // TOFIX
      renderer.setPixelRatio(window.devicePixelRatio);
      $("#threejsContainer").height($("#threejsContainer").width() / aspectRatio);
      renderer.setSize($("#threejsContainer").width(), $("#threejsContainer").height());
      $("#threejsContainer").append(renderer.domElement);
      $("#threejsContainer").append(WEBVR.createButton(renderer));
      $("#threejsContainer").show();

      $("#btnFullscreen").css({ top: $("#threejsContainer").height() - $("#btnFullscreen").height(), left: $("#threejsContainer").width() - $("#btnFullscreen").width() });

      $("#btnFullscreen").on("click", function () {
         if (renderer.domElement.requestFullscreen)
            renderer.domElement.requestFullscreen();
         else if (renderer.domElement.webkitRequestFullScreen)
            renderer.domElement.webkitRequestFullScreen();
      });


      $(window).resize(function () {
         $("#threejsContainer").height($("#threejsContainer").width() / aspectRatio);
         renderer.setSize($("#threejsContainer").width(), $("#threejsContainer").height());
      });

      videoleft = document.getElementById('remoteViewLeft');
      //videoleft.muted = true;
      videoleft.setAttribute('webkit-playsinline', 'webkit-playsinline');
      textureleft = new THREE.Texture(videoleft);
      textureleft.generateMipmaps = false;
      textureleft.minFilter = THREE.NearestFilter;
      textureleft.maxFilter = THREE.NearestFilter;
      textureleft.format = THREE.RGBFormat;


      videoright = document.getElementById('remoteViewRight');
      //videoright.muted = true;
      videoright.setAttribute('webkit-playsinline', 'webkit-playsinline');
      textureright = new THREE.Texture(videoright);
      textureright.generateMipmaps = false;
      textureright.minFilter = THREE.NearestFilter;
      textureright.maxFilter = THREE.NearestFilter;
      textureright.format = THREE.RGBFormat;


      //###################################################

      var radius = 0.5; //This is the point at 180 degree on the image.


      //###################################################

      var isFacedUp = true; //if false, video is faced up.

      //LEFT SIDE
      geometryleft = new THREE.SphereGeometry(500, 50, 50);

      if (isFacedUp) {
         var faceVertexUvsleft = geometryleft.faceVertexUvs[0];
         for (var i = 0; i < faceVertexUvsleft.length; i++) {
            var uvs = faceVertexUvsleft[i];
            var face = geometryleft.faces[i];

            //face.color.setRGB(Math.abs(uvs[0].x), Math.abs(uvs[0].x), Math.abs(uvs[0].x));
            //face.color.setRGB(Math.abs(uvs[0].y), Math.abs(uvs[0].x), 1);
            //face.color.setRGB(Math.abs(face.normal.x), Math.abs(face.normal.x), Math.abs(face.normal.x));
            //face.color.setRGB(Math.abs(face.normal.y), Math.abs(face.normal.y), Math.abs(face.normal.y));
            //face.color.setRGB(Math.abs(face.normal.z), Math.abs(face.normal.z), Math.abs(face.normal.z));

            for (var j = 0; j < 3; j++) {
               var x = face.vertexNormals[j].x;
               var y = face.vertexNormals[j].y;
               var z = face.vertexNormals[j].z;

               var currentRadius = (1 - y) * radius; //(1 - y) goes from 0 to 2


               var correction = (x === 0 && z === 0) ? 1 : Math.acos(y) / (Math.PI / 2) / Math.sqrt(x * x + z * z);
               //correction = 1;
               //console.log(correction);

               if ((1 - y) < 1) {
                  uvs[j].x = x * 0.5 * radius * correction + 0.5;
                  uvs[j].y = z * 0.5 * radius * correction + 0.5;
               } else {
                  var radiusOfXZ = Math.sqrt(x * x + z * z);
                  var newRadius = 1 + 1 - radiusOfXZ;
                  var newX = x * newRadius / radiusOfXZ;
                  var newZ = z * newRadius / radiusOfXZ;

                  uvs[j].x = x * 0.5 * radius * correction + (newX - x) * 0.5 * radius + 0.5;
                  uvs[j].y = z * 0.5 * radius * correction + (newZ - z) * 0.5 * radius + 0.5;

                  //uvs[j].x = 0;
                  //uvs[j].y = 0;
               }

               //if (currentRadius > 1) {
               //    uvs[j].x = 0;
               //    uvs[j].y = 0;
               //} else if (currentRadius > radius) {
               //    console.log(x, (x / Math.abs(x) - x + x / Math.abs(x)) * 0.5 * radius + 0.5);
               //}

            }
         }
      }

      geometryleft.rotateX(-Math.PI / 2);
      materialleft = new THREE.MeshBasicMaterial({ map: textureleft });
      materialleft.side = THREE.BackSide;
      meshleft = new THREE.Mesh(geometryleft, materialleft);
      //mesh.rotation.x = 360 * Math.PI / 180;
      //mesh.rotation.y = 0 * Math.PI / 180;
      //mesh.rotation.z = 180 * Math.PI / 180;
      meshleft.layers.set(1); // display in left eye only
      scene.add(meshleft);

      //RIGHT SIDE
      geometryright = new THREE.SphereGeometry(500, 50, 50);

      if (isFacedUp) {
         var faceVertexUvsright = geometryright.faceVertexUvs[0];
         for (var i = 0; i < faceVertexUvsright.length; i++) {
            var uvs = faceVertexUvsright[i];
            var face = geometryright.faces[i];

            //face.color.setRGB(Math.abs(uvs[0].x), Math.abs(uvs[0].x), Math.abs(uvs[0].x));
            //face.color.setRGB(Math.abs(uvs[0].y), Math.abs(uvs[0].x), 1);
            //face.color.setRGB(Math.abs(face.normal.x), Math.abs(face.normal.x), Math.abs(face.normal.x));
            //face.color.setRGB(Math.abs(face.normal.y), Math.abs(face.normal.y), Math.abs(face.normal.y));
            //face.color.setRGB(Math.abs(face.normal.z), Math.abs(face.normal.z), Math.abs(face.normal.z));

            for (var j = 0; j < 3; j++) {
               var x = face.vertexNormals[j].x;
               var y = face.vertexNormals[j].y;
               var z = face.vertexNormals[j].z;

               var currentRadius = (1 - y) * radius; //(1 - y) goes from 0 to 2


               var correction = (x === 0 && z === 0)
                  ? 1
                  : Math.acos(y) / (Math.PI / 2) / Math.sqrt(x * x + z * z);
               //correction = 1;
               //console.log(correction);

               if ((1 - y) < 1) {
                  uvs[j].x = x * 0.5 * radius * correction + 0.5;
                  uvs[j].y = z * 0.5 * radius * correction + 0.5;
               } else {
                  var radiusOfXZ = Math.sqrt(x * x + z * z);
                  var newRadius = 1 + 1 - radiusOfXZ;
                  var newX = x * newRadius / radiusOfXZ;
                  var newZ = z * newRadius / radiusOfXZ;

                  uvs[j].x = x * 0.5 * radius * correction + (newX - x) * 0.5 * radius + 0.5;
                  uvs[j].y = z * 0.5 * radius * correction + (newZ - z) * 0.5 * radius + 0.5;

                  //uvs[j].x = 0;
                  //uvs[j].y = 0;
               }

               //if (currentRadius > 1) {
               //    uvs[j].x = 0;
               //    uvs[j].y = 0;
               //} else if (currentRadius > radius) {
               //    console.log(x, (x / Math.abs(x) - x + x / Math.abs(x)) * 0.5 * radius + 0.5);
               //}

            }
         }
      }

      geometryright.rotateX(-Math.PI / 2);
      materialright = new THREE.MeshBasicMaterial({ map: textureright });
      materialright.side = THREE.BackSide;
      meshright = new THREE.Mesh(geometryright, materialright);
      //mesh.rotation.x = 360 * Math.PI / 180;
      //mesh.rotation.y = 0 * Math.PI / 180;
      //mesh.rotation.z = 180 * Math.PI / 180;
      meshright.layers.set(2); // display in right eye only
      scene.add(meshright);

      // var controls = new THREE.OrbitControls(camera);
      // controls.enableDamping = true;
      // controls.dampingFactor = 2.0;
      // controls.enableZoom = false;
      // controls.maxDistance = 0;
      // controls.minDistance = 0.1;


      setInterval(function () {
         if (videoleft.readyState >= videoleft.HAVE_CURRENT_DATA) {
            textureleft.needsUpdate = true;
         }
         if (videoright.readyState >= videoright.HAVE_CURRENT_DATA) {
            textureright.needsUpdate = true;
         }
      }, 1000 / 24);

      (function renderLoop() {
         //renderer.animate(update);
         requestAnimationFrame(renderLoop);
         renderer.render(scene, camera);
      })();

   };

   var vr, lastPose = 0, minPoseDifference = 20, minPoseValue = 10, maxPoseValue = 90;

   window.addEventListener('vrdisplayconnect', function () {
      navigator.getVRDisplays().then(function (displays) {
         console.log("vrdisplayconnect");
         vr = displays[0];
         getPose();
      });
   });

   window.addEventListener('vrdisplaydisconnect', function () {
      console.log("vrdisplaydisconnect");
      vr = null;
   });

   function getPose() {
      return;
      setTimeout(function () {
         if (!vr)
            return;
         if (vr.getPose().orientation == null) {
            getPose();
            return;
         }

         var pose = vr.getPose().orientation[1] * (-vr.getPose().orientation[3] / Math.abs(vr.getPose().orientation[3]));

         var currentPose = Math.floor(-pose * 50 + 50);
         //Send it to local server if difference is bigger than some value.
         if (Math.abs(lastPose - currentPose) > minPoseDifference) {
            //Camera servo will not return if value is lower than 10 or bigger than 90.
            if (currentPose >= maxPoseValue)
               currentPose = maxPoseValue;
            else if (currentPose <= minPoseValue)
               currentPose = minPoseValue;
            WebRTCConnection.sendDataChannelMessage("2" + currentPose);
            lastPose = currentPose;
         }
         getPose();
      }, 100);
   }

   this.rotateGeometries = function (angle) {
      meshleft.rotation.set(meshleft.rotation.x, -angle, meshleft.rotation.z);
      meshright.rotation.set(meshright.rotation.x, -angle, meshright.rotation.z);
   }

   return this;
};

window.onload = function () {
   StartSocket();
   StartVR.init();
   AddButtonEvents();
};