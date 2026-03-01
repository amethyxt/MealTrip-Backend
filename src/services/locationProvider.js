const axios = require("axios");


// ================= BOUNDING BOX =================
const PROVINCE_BBOX = {
  "Chiang Mai": [18.60, 98.85, 18.95, 99.20],
  "Bangkok": [13.60, 100.30, 14.00, 100.80],
  "Phuket": [7.75, 98.20, 8.20, 98.55],
  "Ayutthaya": [14.20, 100.40, 14.60, 100.80]
};


// ================= OVERPASS SERVERS =================
const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter"
];


// ================= SMART NAME RESOLVER =================
function resolvePlaceName(tags = {}) {
  return (
    tags.name ||
    tags.brand ||
    tags.operator ||
    tags.tourism ||
    tags.amenity ||
    tags.shop ||
    tags.leisure ||
    "Local place"
  );
}


// ================= DISTANCE (meters) =================
function distanceMeters(a, b) {
  const R = 6371000;

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


// ================= REMOVE NEAR DUPLICATES =================
function removeNearbyDuplicates(places, minDistance = 120) {
  const filtered = [];

  for (const place of places) {
    const tooClose = filtered.some(p =>
      distanceMeters(p, place) < minDistance
    );

    if (!tooClose) {
      filtered.push(place);
    }
  }

  return filtered;
}


// ================= FETCH PLACES =================
async function fetchPlaces(province) {

  const bbox = PROVINCE_BBOX[province];

  if (!bbox) {
    console.log("❌ Unknown province:", province);
    return [];
  }

  const [s, w, n, e] = bbox;

  const query = `
[out:json][timeout:25];
(
  node["amenity"="restaurant"](${s},${w},${n},${e});
  node["amenity"="cafe"](${s},${w},${n},${e});
  node["tourism"](${s},${w},${n},${e});
);
out body 80;
`;

  for (const url of OVERPASS_SERVERS) {
    try {
      console.log("🌍 Requesting OSM from:", url);

      const response = await axios.post(url, query, {
        headers: { "Content-Type": "text/plain" },
        timeout: 25000
      });

      const elements = response.data.elements || [];

      console.log("✅ OSM FOUND:", elements.length);

      if (!elements.length) continue;

      // ===== map data =====
      const mapped = elements
        .filter(el => el.lat && el.lon)
        .map(el => {

          let category = "attraction";

          if (el.tags?.amenity === "restaurant")
            category = "restaurant";
          else if (el.tags?.amenity === "cafe")
            category = "cafe";
          else if (el.tags?.tourism)
            category = "attraction";

          return {
            id: el.id,
            name: resolvePlaceName(el.tags),
            lat: el.lat,
            lon: el.lon,
            category
          };
        });

      console.log("🧹 Before dedup:", mapped.length);

      const cleaned = removeNearbyDuplicates(mapped);

      console.log("🧠 After dedup:", cleaned.length);

      return cleaned;

    } catch (err) {
      console.log("🔥 Overpass failed:", url);
    }
  }

  console.log("❌ All Overpass servers failed");
  return [];
}

module.exports = { fetchPlaces };