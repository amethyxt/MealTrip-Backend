const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "mock_pois.json");
const pois = JSON.parse(fs.readFileSync(file, "utf8"));

for (const p of pois) {
  p.imageUrl = `/images/${p.poiId}.jpg`;
}

fs.writeFileSync(file, JSON.stringify(pois, null, 2), "utf8");
console.log("✅ updated imageUrl for", pois.length, "items");
