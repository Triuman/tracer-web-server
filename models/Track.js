var mongoose = require("mongoose");

var trackSchema = new mongoose.Schema({
   _id: mongoose.Schema.Types.ObjectId,
   uuid: {type: String, required: true},
   name: {type: String, required: true},
   server_address: {type: String, required: false},
   status: {type: Number, required: true},
   room_id_in_race: {type: String, required: false}
});

var Track = module.exports = mongoose.model("Track", trackSchema);