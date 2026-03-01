// models/Member.js

const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const memberSchema = new Schema(
  {
    trip_id: {
      type: Schema.Types.ObjectId,
      ref: "Trip",
      required: true,
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// ✅ FIX OverwriteModelError
module.exports =
  mongoose.models.Member ||
  mongoose.model("Member", memberSchema);