var mongoose = require("mongoose");

var adminSchema = new mongoose.Schema({
   _id: mongoose.Schema.Types.ObjectId,
   uuid: {type: String, required: true},
   username: {type: String, required: true},
   password: {type: String, required: true},
   last_login_date: {type: Number, required: true}
});

var Admin = module.exports = mongoose.model("Admin", adminSchema);