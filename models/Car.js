var mongoose = require("mongoose");

var carSchema = new mongoose.Schema({
   _id: mongoose.Schema.Types.ObjectId,
   uuid_id: {type: String, required: true},
   name: {type: String, required: true},
   status: {type: String, required: true},
   track_id: {type: String, required: true},
   battery_status: {type: Number, required: true}
});

var Car = module.exports = mongoose.model("Car", carSchema);