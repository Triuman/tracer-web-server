var mongoose = require("mongoose");

var trackSchema = new mongoose.Schema({
   _id: mongoose.Schema.Types.ObjectId,
   uuid: {type: String, required: true},
   name: {type: String, required: true},
   status: {type: Number, required: true}
});

var Track = module.exports = mongoose.model("Track", trackSchema);