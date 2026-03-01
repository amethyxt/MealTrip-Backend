// models/Trip.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const tripSchema = new Schema({

  trip_name: {
    type: String,
    required: true
  },

  host_id: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null
  },

  status: {
    type: String,
    enum: ["waiting", "planned", "voting", "finished"],
    default: "waiting"
  },

  // ✅ กัน duplicate null
  invite_code: {
    type: String,
    unique: true,
    sparse: true,
    default: undefined
  },

  budget_money: {
    type: Number,
    default: 0
  },

  budget_time: {
    type: Number,
    default: 0
  },

  constraints: {
    type: Object,
    default: {}
  },

  // ===============================
  // ⭐ AI TRIP PLANNER DATA
  // ===============================

  province: {
    type: String
  },

  days: {
    type: Number,
    default: 1
  },

  // 👥 NEW — จำนวนคน
  people: {
    type: Number,
    default: 1,
    min: 1
  },

  preferences: {
    type: Object,
    default: {}
  },

  tripPlan: {
    type: Object,
    default: {}
  },

  // ===============================
  // 🚗 TRANSPORT (CAR ONLY)
  // ===============================
  transport: {
    type: {
      type: String,
      default: "car"
    },
    totalDistance: {
      type: Number,
      default: 0
    },
    totalTravelTime: {
      type: Number,
      default: 0
    },
    fuelCost: {
      type: Number,
      default: 0
    }
  },

  // ===============================
  // 💰 BUDGET (PER PERSON MODEL)
  // ===============================
  budget: {
    totalTripCost: {
      type: Number,
      default: 0
    },
    costPerPerson: {
      type: Number,
      default: 0
    },
    fuelPerPerson: {
      type: Number,
      default: 0
    },
    hotelPerPerson: {
      type: Number,
      default: 0
    },
    foodPerPerson: {
      type: Number,
      default: 0
    }
  }

}, { timestamps: true });

module.exports = mongoose.model("Trip", tripSchema);