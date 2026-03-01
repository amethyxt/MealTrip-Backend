// models/Trip.js

const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const tripSchema = new Schema(
  {
    trip_name: {
      type: String,
      required: true,
    },

    host_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    status: {
      type: String,
      enum: ["waiting", "planned", "voting", "finished"],
      default: "waiting",
    },

    invite_code: {
      type: String,
      unique: true,
      sparse: true,
      default: undefined,
    },

    budget_money: {
      type: Number,
      default: 0,
    },

    budget_time: {
      type: Number,
      default: 0,
    },

    constraints: {
      type: Object,
      default: {},
    },

    // ===== AI TRIP =====
    province: String,

    days: {
      type: Number,
      default: 1,
    },

    people: {
      type: Number,
      default: 1,
      min: 1,
    },

    preferences: {
      type: Object,
      default: {},
    },

    tripPlan: {
      type: Object,
      default: {},
    },

    // ===== TRANSPORT =====
    transport: {
      type: {
        type: String,
        default: "car",
      },
      totalDistance: { type: Number, default: 0 },
      totalTravelTime: { type: Number, default: 0 },
      fuelCost: { type: Number, default: 0 },
    },

    // ===== BUDGET =====
    budget: {
      totalTripCost: { type: Number, default: 0 },
      costPerPerson: { type: Number, default: 0 },
      fuelPerPerson: { type: Number, default: 0 },
      hotelPerPerson: { type: Number, default: 0 },
      foodPerPerson: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

// ✅ FIX OverwriteModelError
module.exports =
  mongoose.models.Trip ||
  mongoose.model("Trip", tripSchema);