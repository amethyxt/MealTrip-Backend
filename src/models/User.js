// models/User.js

const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: true,
    },

    preferences: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

// ✅ FIX OverwriteModelError
module.exports =
  mongoose.models.User ||
  mongoose.model("User", userSchema);