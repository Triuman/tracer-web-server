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
   drivers: {type: Object, required: true}, //{driver_id: { status }}
   chat: [{ username : String, text : String }],
   race: {
        uuid: {type: String, required: true},
        start_date: {type: Number, required: true},
        finish_date: {type: Number, required: false},
        status: {type: Number, required: true},
        driver_cars: {type: Object, required: true}, // { streamed_car_id: String, controlled_car_id: String },
        ranking: [String] //Driver id list in order.
    }
});

var Room = module.exports = mongoose.model("Room", roomSchema);