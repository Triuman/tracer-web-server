var mongoose = require("mongoose");

var roomSchema = new mongoose.Schema({
   _id: mongoose.Schema.Types.ObjectId,
   uuid: {type: String, required: true},
   name: {type: String, required: true},
   password: {type: String, required: false},
   status: {type: Number, required: true},
   create_date: {type: Number, required: true},
   admin_id: {type: String, required: true},
   track_id: {type: String, required: true},
   drivers: {type: Object, required: true}, //{ driver_id, status, controlled_car_id, streamed_car_id }
   race: {type: Object, required: false}
});

var Room = module.exports = mongoose.model("Room", roomSchema);