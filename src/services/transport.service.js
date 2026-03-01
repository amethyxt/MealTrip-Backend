// services/transport.service.js

/**
 * Transport Calculation Service
 * ใช้ estimation model (เหมาะกับ student project แต่ logic ดู production)
 */

function calculateTransport(distanceKm = 0, transportType = "car") {

  let cost = 0;
  let time = 0; // hours

  switch (transportType) {

    // ================= CAR =================
    case "car":
      // 4 บาท / km
      // avg speed 60 km/h
      cost = distanceKm * 4;
      time = distanceKm / 60;
      break;

    // ================= TRAIN =================
    case "train":
      // 1.2 บาท / km
      // avg speed 80 km/h
      cost = distanceKm * 1.2;
      time = distanceKm / 80;
      break;

    // ================= FLIGHT =================
    case "flight":
      if (distanceKm > 400) {
        // base airfare + distance factor
        cost = 1200 + (distanceKm * 2);
        time = distanceKm / 600; // avg flight speed
      } else {
        // fallback → train
        cost = distanceKm * 1.2;
        time = distanceKm / 80;
        transportType = "train";
      }
      break;

    default:
      cost = distanceKm * 4;
      time = distanceKm / 60;
  }

  return {
    type: transportType,
    distance: Number(distanceKm.toFixed(2)),
    cost: Math.round(cost),
    time: Number(time.toFixed(2)) // hours
  };
}

module.exports = {
  calculateTransport
};