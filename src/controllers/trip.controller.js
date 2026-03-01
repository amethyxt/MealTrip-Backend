const { fetchPlaces } = require("../services/locationProvider");
const Trip = require("../models/Trip");

/* ================= DISTANCE ================= */
function distance(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;

  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 *
    Math.cos(lat1) *
    Math.cos(lat2);

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/* ================= ROUTE OPTIMIZATION ================= */
function optimizeRoute(places) {
  if (!places?.length) return [];

  const remaining = [...places];
  const route = [remaining.shift()];

  while (remaining.length) {
    const last = route[route.length - 1];

    let bestIndex = 0;
    let bestDist = Infinity;

    remaining.forEach((p, i) => {
      const d = distance(last, p);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = i;
      }
    });

    route.push(remaining.splice(bestIndex, 1)[0]);
  }

  return route;
}

/* ================= CLUSTER ================= */
function clusterPlaces(places, gridSize = 0.05) {
  const clusters = {};

  places.forEach(p => {
    const key =
      `${Math.floor(p.lat / gridSize)}_${Math.floor(p.lon / gridSize)}`;

    if (!clusters[key]) clusters[key] = [];
    clusters[key].push(p);
  });

  return Object.values(clusters);
}

/* ================= TIMELINE ================= */
function buildTimeline(places) {
  let current = 9 * 60;
  let prev = null;

  const duration = {
    attraction: 90,
    restaurant: 75,
    cafe: 60
  };

  const format = m =>
    `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;

  const result = [];

  for (const place of places) {

    let travelMin = 0;
    let travelKm = 0;

    if (prev) {
      travelKm = Number(distance(prev, place).toFixed(2));
      travelMin = Math.max(5, Math.round((travelKm / 30) * 60));
      current += travelMin;
    }

    const stay = duration[place.category] || 60;

    result.push({
      ...place,
      visitTime: format(current),
      durationMin: stay,
      travelMin,
      travelKm
    });

    current += stay;
    prev = place;
  }

  return result;
}

/* ================= TOTAL DISTANCE ================= */
function calculateTotalDistance(tripPlan) {
  let total = 0;

  Object.values(tripPlan || {}).forEach(day => {
    day.forEach(place => {
      total += place.travelKm || 0;
    });
  });

  return Number(total.toFixed(2));
}

/* ================= PLAN TRIP (FIXED) ================= */
exports.planTrip = async (req, res) => {

  console.log("===== PLANTRIP BODY =====");
  console.log(req.body);

  try {
    const { province, days = 1, people = 1 } = req.body;

    if (!province) {
      return res.status(400).json({
        message: "province is required"
      });
    }

    let places;
    try {
      places = await fetchPlaces(province);
    } catch (err) {
      console.error("FETCH PLACES ERROR:", err);
      return res.status(500).json({
        message: "fetchPlaces crashed",
        error: err.message
      });
    }

    if (!places || !places.length) {
      return res.status(400).json({
        message: "No places found"
      });
    }

    const clusters = clusterPlaces(places);
    clusters.sort((a, b) => b.length - a.length);

    const pool = clusters.slice(0, 5).flat();
    const shuffled = [...pool].sort(() => Math.random() - 0.5);

    const tripPlan = {};

    for (let d = 1; d <= days; d++) {
      const start = (d - 1) * 5;
      const dayPlaces = shuffled.slice(start, start + 5);

      tripPlan[`day${d}`] =
        buildTimeline(optimizeRoute(dayPlaces));
    }

    const trip = await Trip.create({
      trip_name: `Trip to ${province}`,
      province,
      days,
      people,
      tripPlan,
      status: "planned"
    });

    return res.json({
      tripId: trip._id,
      tripPlan
    });

  } catch (e) {
    console.error("PLANTRIP FATAL:", e);

    return res.status(500).json({
      message: "PlanTrip failed",
      error: e.message
    });
  }
};

/* ================= CALCULATE BUDGET (CAR ONLY + PER PERSON) ================= */
exports.calculateBudget = async (req, res) => {
  try {

    const trip = await Trip.findById(req.params.id);
    if (!trip)
      return res.status(404).json({ message: "Trip not found" });

    const people = Math.max(1, trip.people || 1);
    const totalDistance = calculateTotalDistance(trip.tripPlan);

    /* 🚗 Fuel cost */
    const fuelCost = Math.round(totalDistance * 4);

    /* 🍜 Food */
    const foodTotal = people * trip.days * 3 * 300;

    /* 🏨 Hotel */
    const nights = Math.max(0, trip.days - 1);
    const rooms = Math.ceil(people / 2);
    const hotelTotal = rooms * 1200 * nights;

    const totalTripCost = fuelCost + foodTotal + hotelTotal;

    /* ===== SAVE TRANSPORT ===== */
    trip.transport = {
      type: "car",
      totalDistance,
      totalTravelTime: Number((totalDistance / 60).toFixed(2)),
      fuelCost
    };

    /* ===== SAVE BUDGET ===== */
    trip.budget = {
      totalTripCost,
      costPerPerson: Math.round(totalTripCost / people),
      fuelPerPerson: Math.round(fuelCost / people),
      hotelPerPerson: Math.round(hotelTotal / people),
      foodPerPerson: Math.round(foodTotal / people)
    };

    await trip.save();

    res.json({
      message: "Budget calculated",
      people,
      transport: trip.transport,
      budget: trip.budget
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Budget calculation failed" });
  }
};

/* ================= READ ================= */
exports.getAllTrips = async (req, res) => {
  res.json(await Trip.find().sort({ createdAt: -1 }));
};

exports.getTripById = async (req, res) => {
  const trip = await Trip.findById(req.params.id);
  if (!trip)
    return res.status(404).json({ message: "Trip not found" });

  res.json(trip);
};

/* ================= SUMMARY ================= */
exports.getTripSummary = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);

    if (!trip)
      return res.status(404).json({ message: "Trip not found" });

    let totalPlaces = 0;
    let totalTravelKm = 0;
    let totalTravelMin = 0;

    Object.values(trip.tripPlan || {}).forEach(day => {
      day.forEach(place => {
        totalPlaces++;
        totalTravelKm += place.travelKm || 0;
        totalTravelMin += place.travelMin || 0;
      });
    });

    res.json({
      days: trip.days,
      people: trip.people,
      totalPlaces,
      totalTravelKm: Number(totalTravelKm.toFixed(2)),
      totalTravelMin
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Summary failed" });
  }
};

/* ================= DELETE ================= */
exports.deleteTrip = async (req, res) => {
  await Trip.findByIdAndDelete(req.params.id);
  res.json({ message: "Trip deleted" });
};

/* ================= REPLAN DAY ================= */
exports.replanDay = async (req, res) => {

  const trip = await Trip.findById(req.params.id);
  if (!trip)
    return res.status(404).json({ message: "Trip not found" });

  const places = await fetchPlaces(trip.province);
  if (!places?.length)
    return res.status(400).json({ message: "No places found" });

  const shuffled = [...places].sort(() => Math.random() - 0.5);

  const newDay =
    buildTimeline(optimizeRoute(shuffled.slice(0, 5)));

  trip.tripPlan[`day${req.body.day || 1}`] = newDay;
  await trip.save();

  res.json({ dayPlan: newDay });
};

/* ================= REGENERATE ================= */
exports.regenerateTrip = async (req, res) => {

  const trip = await Trip.findById(req.params.id);
  if (!trip)
    return res.status(404).json({ message: "Trip not found" });

  const places = await fetchPlaces(trip.province);
  if (!places?.length)
    return res.status(400).json({ message: "No places found" });

  const clusters = clusterPlaces(places);
  clusters.sort((a, b) => b.length - a.length);

  const pool = clusters.slice(0, 5).flat();
  const shuffled = [...pool].sort(() => Math.random() - 0.5);

  const newPlan = {};

  for (let d = 1; d <= trip.days; d++) {
    const start = (d - 1) * 5;
    const dayPlaces = shuffled.slice(start, start + 5);

    newPlan[`day${d}`] =
      buildTimeline(optimizeRoute(dayPlaces));
  }

  trip.tripPlan = newPlan;
  await trip.save();

  res.json({ message: "Trip regenerated", tripPlan: newPlan });
};