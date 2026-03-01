// models/Vote.js

const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const voteSchema = new Schema(
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

    poi_id: {
      type: String,
      required: true,
    },

    score: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    imageUrl: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// ✅ FIX OverwriteModelError
module.exports =
  mongoose.models.Vote ||
  mongoose.model("Vote", voteSchema);