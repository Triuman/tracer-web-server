var mongoose = require("mongoose");

var driverSchema = new mongoose.Schema({
   _id: mongoose.Schema.Types.ObjectId,
   guid_id: {type: String, required: true},
   username: {type: String, required: true},
   email: {type: String, required: true},
   password: {type: String, required: true},
   coin: {type: Number, required: true},
   xp: {type: Number, required: true},
   bronze_medal: {type: Number, required: true},
   silver_medal: {type: Number, required: true},
   gold_medal: {type: Number, required: true},
   registeration_date: {type: Number, required: true},
   last_login_date: {type: Number, required: true},
   status: {type: Number, required: true}
});

var Driver = module.exports = mongoose.model("Driver", driverSchema);