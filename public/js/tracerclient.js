"use strict";

//To prevent Threejs getInverse warnings.
console.warn = function() {};

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
      SAME_USERNAME_OR_EMAIL_EXIST: 8,
      NO_TRACK_WITH_GIVEN_ID: 9,
      NO_ROOM_WITH_GIVEN_ID: 10
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

var driver = null;

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

      socket.on('snapshot', (data) => {
            console.log("Got a snapshot -> ");
            console.log(data);
      });

      socket.on('offer', (data) => {
            console.log("Got offer! -> ", data.sdp);
            if (data.isleft)
                  WebRTCConnection.setOfferLeft(data.sdp);
            else
                  WebRTCConnection.setOfferRight(data.sdp);
      });

      socket.on('room-update', (update) => {
            console.log("Got room update! -> ");
            console.log(update);
            UpdateHandler[update.type](update.data);
      });
      var RoomUpdateHandler = {};
      RoomUpdateHandler[UpdateTypes.DRIVER_JOINED_ROOM] = function (data) {
            //put driver to next empty slot
            //data: { driver_view }
      };
      RoomUpdateHandler[UpdateTypes.DRIVER_LEFT_ROOM] = function (data) {
            //remove driver from the slot
            //data: { driver_id }
      };
      RoomUpdateHandler[UpdateTypes.DRIVER_GOT_ONLINE] = function (data) {
            //change slot to online/not ready view
            //data: { driver_id }
      };
      RoomUpdateHandler[UpdateTypes.DRIVER_GOT_OFFLINE] = function (data) {
            //change slot to offline view
            //data: { driver_id }
      };
      RoomUpdateHandler[UpdateTypes.DRIVER_IS_READY] = function (data) {
            //set driver's slot to green
            //data: { driver_id }
      };
      RoomUpdateHandler[UpdateTypes.DRIVER_IS_NOT_READY] = function (data) {
            //set driver's slot to yellow
            //data: { driver_id }
      };
      RoomUpdateHandler[UpdateTypes.ADMIN_CHANGED] = function (data) {
            //if this is admin, let him see kick buttons. Now he is able to kick other drivers.
            //data: { driver_id }
      };
      RoomUpdateHandler[UpdateTypes.ROOM_CHAT] = function (data) {
            console.log("Room chat ->");
            console.log(data);
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
            //data = { track_id, room_view, admin_id }
      };
      UpdateHandler[UpdateTypes.ROOM_CLOSED] = function (data) {
            //remove room from its track's room list
            //data: { room_id }
      };
      UpdateHandler[UpdateTypes.ROOM_ENTERED_RACE] = function (data) {
            //remove room from its track's room list and show it over the camera stream.
            //data: { room: Snapshot[track_id].room_in_race }
      };
      UpdateHandler[UpdateTypes.ROOM_FINISHED_RACE] = function (data) {
            //show result of the race.
            //data: { room_id, ranking }
      };
      UpdateHandler[UpdateTypes.DRIVER_JOINED_ROOM] = function (data) {
            //set room driver count text
            //data: { room_id, driver_count }
      };
      UpdateHandler[UpdateTypes.DRIVER_LEFT_ROOM] = function (data) {
            //set room driver count text
            //data: { room_id, driver_count }
      };
      //These four updates will call the same function.
      UpdateHandler[UpdateTypes.DRIVER_GOT_ONLINE] = function (data) {
            //Update room car slot colors with the room_view.
            //data: { room_view: RoomViewModel(ActiveRooms[room]) }
      };
      UpdateHandler[UpdateTypes.DRIVER_GOT_OFFLINE] = function (data) {
            //Update room car slot colors with the room_view.
            //data: { room_view: RoomViewModel(ActiveRooms[room]) }
      };
      UpdateHandler[UpdateTypes.DRIVER_IS_READY] = function (data) {
            //Update room car slot colors with the room_view.
            //data: { room_view: RoomViewModel(ActiveRooms[room]) }
      };
      UpdateHandler[UpdateTypes.DRIVER_IS_NOT_READY] = function (data) {
            //Update room car slot colors with the room_view.
            //data: { room_view: RoomViewModel(ActiveRooms[room]) }
      };
      UpdateHandler[UpdateTypes.GLOBAL_CHAT] = function (data) {
            console.log("Global chat ->");
            console.log(data);
            if (data.track_id && data.chat) {
                  //TODO: Append new chat to the track with track_id
            }
      };

};

function SetReady() {
      //we tell web server that we are ready to race.
      socket.emit("ready", function (data) {
            if (data.success) {
                  //set "Set Ready" button to "Not Ready"
            } else {

            }
      });
}
function SetNotReady() {
      //we tell web server that we are ready to race.
      socket.emit("notready", function (data) {
            if (data.success) {
                  //set "Set Not Ready" button to "Set Ready"
            } else {

            }
      });
}

function Register(u, p, e) {
      socket.emit("register", { username: u, password: p, email: e }, (data) => {
            console.log("Are we Registered? -> ");
            onAuthenticate(data);
      });
}

function SendAnswer(sdp, isleft) {
      socket.emit("answer", { sdp, isleft }, (data) => {
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
      socket.emit("candidate", { candidate, isleft }, (data) => {
            console.log("Did we send candidate? -> ");
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
      localStorage.removeItem("token"); //Even log out fails, we log out from here anyways.
      //TODO: And do some other stuff.
}

function Authenticate(u, p) {
      if (!p && u) {
            console.log("We are using token authentication. ->");
            console.log(u);
            socket.emit("authenticate", { token: u }, (data) => {
                  onAuthenticate(data);
            });
      } else {
            socket.emit("authenticate", { username: u, password: p }, (data) => {
                  onAuthenticate(data);
            });
      }
}

function onAuthenticate(data) {
      console.log("Are we authenticated? -> ");
      console.log(data);
      if (data.success) {
            driver = data.driver;
            localStorage.setItem("token", data.token);
      } else {
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
                        //remove token from the local storage
                        localStorage.removeItem("token");
                        break;
                  case Enum_Callback_Reason.WRONG_CREDENTIALS:
                        console.log("WRONG_CREDENTIALS");
                        break;
                  case Enum_Callback_Reason.MISSING_INFO:
                        console.log("MISSING_INFO");
                        break;
            }
      }
}

function CreateRoom(room_name, track_id) {
      socket.emit("create-room", { room_name, track_id }, (data) => {
            console.log("Did we got a new room? -> ");
            console.log(data);
            if (data.success == false) {
                  switch (data.reason) {
                        case Enum_Callback_Reason.MISSING_INFO:
                              break;
                  }
            }
      });
}

function JoinRoom(roomId) {
      socket.emit("join-room", { room_id: roomId }, (data) => {
            console.log("Did we join to the room? -> ");
            console.log(data);
            if (data.success == false) {
                  switch (data.reason) {
                        case Enum_Callback_Reason.MISSING_INFO:
                              break;
                  }
            }
      });
}

function SendRoomChat(chat) {
      socket.emit("room-chat", { chat }, (data) => {
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

function SendGlobalChat(track_id, chat) {
      socket.emit("global-chat", { track_id, chat }, (data) => {
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
                        currentLeftRightValue += -49;
                        break;
                  case 68: //d
                        currentLeftRightValue += +49;
                        break;
                  case 87: //w
                        currentLeftForwardBackward = -49;
                        break;
                  case 83: //s
                        currentLeftForwardBackward = +49;
                        break;
                  default:
            }
      };

      document.onkeyup = function (e) {
            switch (e.keyCode) {
                  case 65: //a
                        currentLeftRightValue += +49;
                        break;
                  case 68: //d
                        currentLeftRightValue += -49;
                        break;
                  case 87: //w
                        currentLeftForwardBackward = +49;
                        break;
                  case 83: //s
                        currentLeftForwardBackward = -49;
                        break;
                  default:
            }
      };


      var remoteViewLeft = document.getElementById("remoteViewLeft");

      remoteViewLeft.onkeydown = document.onkeydown;
      remoteViewLeft.onkeyup = document.onkeyup;
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
            "iceServers": [{ "urls": ["stun:stun.1.google.com:19302"] }]
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
                        console.log("Data channel is NULL");
            },
            setOfferLeft: function (sdp) {
                  //Each time we get a new offer, we create a new RTCPeerConnection.

                  if (pcLeft)
                        pcLeft.close();
                  pcLeft = new RTCPeerConnection(configuration);

                  // send any ice candidates to the other peer
                  pcLeft.onicecandidate = function (evt) {
                        console.log("We got a candidate!");
                        SendIceCandidate(evt.candidate, true);
                  };

                  // once remote stream arrives, show it in the remote video element
                  pcLeft.ontrack = function (event) {
                        console.log("We got remote stream!!");
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

                  dataChannel.onmessage = function (event) {
                        console.log("Got Data Channel Message:", event.data);
                  };

                  dataChannel.onopen = function () {
                        console.log("The Data Channel is Open!");
                        dataChannel.send("0" + driver.uuid);

                        addKeyEvents();
                  };

                  dataChannel.onclose = function () {
                        console.log("The Data Channel is Closed");
                  };


            },
            setOfferRight: function (sdp) {
                  //Each time we get a new offer, we create a new RTCPeerConnection.

                  if (pcRight)
                        pcRight.close();
                  pcRight = new RTCPeerConnection(configuration);

                  // send any ice candidates to the other peer
                  pcRight.onicecandidate = function (evt) {
                        console.log("We got a candidate!");
                        SendIceCandidate(evt.candidate, false);
                  };

                  // once remote stream arrives, show it in the remote video element
                  pcRight.ontrack = function (event) {
                        console.log("We got remote stream!!");
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





var StartVR = function () {
      var scene = new THREE.Scene();
      var fov = 90;
      var aspect = window.innerWidth / window.innerHeight;
      var near = 1;
      var far = 1000;
      var camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
      camera.position.set(0, 0, 0);
      camera.layers.enable(1); // render left view when no stereo available

      var renderer = new THREE.WebGLRenderer();
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.vr.enabled = true;
      renderer.vr.userHeight = 0; // TOFIX
      document.body.appendChild(renderer.domElement);
      document.body.appendChild(WEBVR.createButton(renderer));

      var videoleft = document.getElementById('remoteViewLeft');
      //videoleft.muted = true;
      videoleft.setAttribute('webkit-playsinline', 'webkit-playsinline');
      var textureleft = new THREE.Texture(videoleft);
      textureleft.generateMipmaps = false;
      textureleft.minFilter = THREE.NearestFilter;
      textureleft.maxFilter = THREE.NearestFilter;
      textureleft.format = THREE.RGBFormat;


      var videoright = document.getElementById('remoteViewRight');
      //videoright.muted = true;
      videoright.setAttribute('webkit-playsinline', 'webkit-playsinline');
      var textureright = new THREE.Texture(videoright);
      textureright.generateMipmaps = false;
      textureright.minFilter = THREE.NearestFilter;
      textureright.maxFilter = THREE.NearestFilter;
      textureright.format = THREE.RGBFormat;


      //###################################################

      var radius = 0.5; //This is the point at 180 degree on the image.


      //###################################################

      var isFacedUp = true; //if false, video is faced up.

      //LEFT SIDE
      var geometryleft = new THREE.SphereGeometry(500, 50, 50);

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
      var materialleft = new THREE.MeshBasicMaterial({ map: textureleft });
      materialleft.side = THREE.BackSide;
      var meshleft = new THREE.Mesh(geometryleft, materialleft);
      //mesh.rotation.x = 360 * Math.PI / 180;
      //mesh.rotation.y = 0 * Math.PI / 180;
      //mesh.rotation.z = 180 * Math.PI / 180;
      meshleft.layers.set(1); // display in left eye only
      scene.add(meshleft);

      //RIGHT SIDE
      var geometryright = new THREE.SphereGeometry(500, 50, 50);

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
      var materialright = new THREE.MeshBasicMaterial({ map: textureright });
      materialright.side = THREE.BackSide;
      var meshright = new THREE.Mesh(geometryright, materialright);
      //mesh.rotation.x = 360 * Math.PI / 180;
      //mesh.rotation.y = 0 * Math.PI / 180;
      //mesh.rotation.z = 180 * Math.PI / 180;
      meshright.layers.set(2); // display in right eye only
      scene.add(meshright);

      var controls = new THREE.OrbitControls(camera);
      controls.enableDamping = true;
      controls.dampingFactor = 2.0;
      controls.enableZoom = false;
      controls.maxDistance = 0;
      controls.minDistance = 0.1;


      renderer.vr.enabled = true;
      document.body.appendChild(WEBVR.createButton(renderer));

      setInterval(function () {
            if (videoleft.readyState >= videoleft.HAVE_CURRENT_DATA) {
                  textureleft.needsUpdate = true;
            }
            if (videoright.readyState >= videoright.HAVE_CURRENT_DATA) {
                  textureright.needsUpdate = true;
            }
      },
            1000 / 24);

      (function renderLoop() {
            //renderer.animate(update);
            requestAnimationFrame(renderLoop);
            renderer.render(scene, camera);
      })();


      
var vr, lastPose;

window.addEventListener('vrdisplayconnect',
      function () {
            navigator.getVRDisplays().then(function (displays) {
                  console.log("vrdisplayconnect");
                  vr = displays[0];
                  getPose();
            });
      });
window.addEventListener('vrdisplaydisconnect',
      function () {
            console.log("vrdisplaydisconnect");
            vr = null;
      });

function getPose() {
      setTimeout(function () {
            if(!vr)
                  return;
            if (vr.getPose().orientation == null) {
                  getPose();
                  return;
            }

            var pose = vr.getPose().orientation[1] * (-vr.getPose().orientation[3] / Math.abs(vr.getPose().orientation[3]));

            var currentPose = Math.floor(pose * 50 + 50);
            if (lastPose != currentPose)
                  //Send it to local server.
                  WebRTCConnection.sendDataChannelMessage("2" + Math.floor(-pose * 50 + 50));
                  rotateGeometries(pose * Math.PI / 2 * 1.4);

            lastPose = currentPose;

            getPose();
      }, 100);
}

      function rotateGeometries(angle){
            meshleft.rotation.set(meshleft.rotation.x, -angle, meshleft.rotation.z);
            meshright.rotation.set(meshright.rotation.x, -angle, meshright.rotation.z);
      }
    
};

window.onload = function () {
      StartSocket();
      StartVR();
}