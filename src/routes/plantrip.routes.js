const express = require("express");
const router = express.Router();
const tripController = require("../controllers/trip.controller");

// ================= CREATE =================
router.post("/plan-trip", tripController.planTrip);

// ================= READ =================
router.get("/trips", tripController.getAllTrips);
router.get("/trips/:id", tripController.getTripById);

// ⭐ TRIP SUMMARY
router.get("/trips/:id/summary", tripController.getTripSummary);

// ⭐ NEW — CALCULATE TRANSPORT + BUDGET
router.post(
  "/trips/:id/calculate-budget",
  tripController.calculateBudget
);

// ================= REPLAN DAY =================
router.post("/trips/:id/replan", tripController.replanDay);

// ================= REGENERATE ENTIRE TRIP =================
router.post("/trips/:id/regenerate", tripController.regenerateTrip);

// ================= DELETE =================
router.delete("/trips/:id", tripController.deleteTrip);

module.exports = router;