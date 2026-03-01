// server.js

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const User = require("./models/User");
const Trip = require("./models/Trip");
const Member = require("./models/Member");
const Vote = require("./models/Vote");
const axios = require("axios");
require("dotenv").config();
const plantripRoutes = require("./src/routes/plantrip.routes");

// ✅ MOCK POIS (60 places)
const mockPois = require("./mock_pois.json");
const mockPoiMap = new Map((mockPois || []).map((p) => [p.poiId, p]));

const app = express();
app.use(express.json());
app.use("/api/plantrip", plantripRoutes);

// ✅ เสิร์ฟไฟล์รูปจากโฟลเดอร์ images
app.use("/images", express.static(path.join(__dirname, "images")));

const PORT = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI not found. Set it in environment variables.");
  process.exit(1);
}

mongoose
  .connect(MONGO_URI, {
    dbName: "mealtrip",   // ⭐ บังคับใช้ database นี้
  })
  .then(() => console.log("✅ เชื่อมต่อกับ MongoDB สำเร็จ!"))
  .catch((error) => {
    console.error("❌ เชื่อมต่อ MongoDB ไม่ติด...");
    console.error(error.message);
  });

app.get("/", (req, res) => res.send("สวัสดี! Server ของ Meal Trip ทำงานแล้ว"));

// ------------------------------
// Helper: time / distance / types
// ------------------------------

const DEFAULT_TIME_LIMIT_MINUTES = 180; // fallback
const DEFAULT_MAX_DISTANCE_KM = 5;

// ✅ sanity cap กัน lat/lng หลุดไกลแบบพังโลก (เช่นหลุดไปต่างจังหวัด)
const HARD_SANITY_MAX_DISTANCE_KM = 20;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function estimateStayMinutes(type) {
  const t = (type || "").toLowerCase();
  if (t === "restaurant") return 60;
  if (t === "cafe") return 45;
  if (t === "temple") return 45;
  return 60; // attraction/other
}

function haversineKm(a, b) {
  if (!a || !b) return null;
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const c =
    2 *
    Math.asin(
      Math.sqrt(
        sinDLat * sinDLat +
          Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng
      )
    );

  return R * c;
}

function estimateTravelMinutes(distKm) {
  if (distKm == null) return 10;
  // สมมติความเร็วในเมือง ~ 20km/h
  const mins = Math.round((distKm / 20) * 60);
  return Math.max(5, mins);
}

function detectTypeFromGoogle(types = []) {
  if (types.includes("restaurant") || types.includes("food")) return "restaurant";
  if (types.includes("cafe")) return "cafe";
  if (types.includes("place_of_worship")) return "temple";
  return "attraction";
}

// ✅ attraction นับรวม temple ด้วย
function typeMatches(actualType, wantType) {
  const a = String(actualType || "").toLowerCase();
  const w = String(wantType || "").toLowerCase();
  if (!w) return true;
  if (w === "attraction") return a === "attraction" || a === "temple";
  return a === w;
}

function normalizeType(t) {
  const s = String(t || "").toLowerCase();
  if (s === "temple") return "attraction";
  if (s === "restaurant") return "restaurant";
  if (s === "cafe") return "cafe";
  return "attraction";
}

// ✅ แปลง query เป็นประเภทที่อยากได้
function inferWantedTypeFromQuery(q = "") {
  const s = String(q).toLowerCase();
  if (s.includes("restaurant") || s.includes("food")) return "restaurant";
  if (s.includes("cafe")) return "cafe";
  if (s.includes("temple")) return "temple";
  if (s.includes("attraction") || s.includes("tourist")) return "attraction";
  return null;
}

function shuffle(arr) {
  return arr
    .map((x) => ({ x, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map((o) => o.x);
}

function toAbsoluteImageUrl(imageUrl, baseUrl) {
  if (!imageUrl) return null;
  const s = String(imageUrl);
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("/")) return baseUrl + s;
  return baseUrl + "/" + s.replace(/^\//, "");
}

function safeImageUrl(imageUrl, baseUrl) {
  const abs = toAbsoluteImageUrl(imageUrl, baseUrl);
  if (!abs || typeof abs !== "string" || abs.length < 6) return null;
  return abs;
}

// ------------------------------
// ✅ Recipe / Pattern (ตาม requirement ใหม่ของคุณ)
// ------------------------------

/**
 * Requirement:
 * - 1–3 ชม: อย่างละ 1 (R + A + C)
 * - 4–6 ชม: อย่างละ 1 แล้วถ้าเหลือค่อยเติม A/C (ห้ามเพิ่มร้าน)
 * - 7 ชม+: เริ่มร้าน -> กลางสุ่ม A/C -> ถ้างบ/เวลาได้ค่อยปิดท้ายร้าน
 */
function buildItineraryRecipe(timeLimitMinutes, budget) {
  const hours = timeLimitMinutes / 60;
  const unlimitedBudget = !budget || Number(budget) <= 0;

  // ค่าเฉลี่ยคร่าว ๆ เอาไว้เช็ค “มีร้าน 2 ได้ไหม”
  const AVG = { restaurant: 450, cafe: 220, attraction: 150 };

  // base targets (ขั้นต่ำที่ควรมี)
  const minTargets = { restaurant: 1, cafe: 1, attraction: 1 };

  // maxCounts = “เพดานต่อหมวด” (ไว้เติมเพิ่ม)
  // maxStops  = “เพดานรวม” (กันยาวเกิน)
  let maxCounts = { restaurant: 1, cafe: 1, attraction: 1 };
  let maxStops = 3;

  // 1–3 ชม: เอาอย่างละ 1 แล้วพอ (ไม่ต้องเติมเพิ่ม)
  if (hours <= 3) {
    maxCounts = { restaurant: 1, cafe: 1, attraction: 1 };
    maxStops = 3;
    return {
      minTargets,
      maxCounts,
      maxStops,
      pattern: buildSlotsPattern({
        startWithRestaurant: true,
        endWithRestaurant: false,
        maxCounts,
        maxStops,
        hours,
      }),
      restaurant2Enabled: false,
    };
  }

  // 4–6 ชม: อย่างละ 1 แล้ว “เติม A/C ได้” แต่ “ร้านไม่เพิ่ม”
  if (hours <= 6) {
    maxCounts = {
      restaurant: 1,
      cafe: hours >= 5 ? 2 : 2, // เปิดให้เติมได้เลย (แต่ยังติดเวลา/งบจริงใน tryAdd)
      attraction: hours >= 5 ? 2 : 2,
    };
    maxStops = clamp(3 + (hours >= 5 ? 2 : 1), 4, 5);

    return {
      minTargets,
      maxCounts,
      maxStops,
      pattern: buildSlotsPattern({
        startWithRestaurant: true,
        endWithRestaurant: false, // ช่วงนี้ไม่อยากมีร้านเยอะ/ไม่ต้องปิดท้ายร้าน
        maxCounts,
        maxStops,
        hours,
      }),
      restaurant2Enabled: false,
    };
  }

  // 7 ชม+: เริ่มด้วยร้าน แล้วถ้างบ/เวลาได้ค่อยปิดท้ายร้าน (ร้าน 2)
  const midCafe = hours >= 9 ? 3 : 2;
  const midAttr = hours >= 9 ? 3 : 2;

  // เช็ค budget คร่าว ๆ ว่าพอมีร้าน 2 ไหม
  const approxNeedFor2Restaurants =
    2 * AVG.restaurant + midCafe * AVG.cafe + midAttr * AVG.attraction;
  const budgetAllows2Restaurants =
    unlimitedBudget || Number(budget) >= Math.round(approxNeedFor2Restaurants * 0.9);

  const restaurantCount = budgetAllows2Restaurants ? 2 : 1;

  maxCounts = {
    restaurant: restaurantCount,
    cafe: midCafe,
    attraction: midAttr,
  };

  // เพดานรวม: 7–8h ให้ได้ประมาณ 5–6 ที่, 9h+ ให้ได้ 7–8 ที่ (ถ้าข้อจำกัดไม่บีบ)
  if (hours < 9) {
    maxStops = restaurantCount === 2 ? 6 : 5;
  } else {
    maxStops = restaurantCount === 2 ? 8 : 7;
  }

  return {
    minTargets,
    maxCounts,
    maxStops,
    pattern: buildSlotsPattern({
      startWithRestaurant: true,
      endWithRestaurant: restaurantCount === 2, // ถ้ามีร้าน 2 → ปิดท้ายร้าน
      maxCounts,
      maxStops,
      hours,
    }),
    restaurant2Enabled: restaurantCount === 2,
  };
}

/**
 * สร้าง pattern “ลำดับหมวด”:
 * - เริ่มร้านเสมอ (ตาม requirement)
 * - กลางสุ่ม A/C ให้ไม่จำเจ
 * - ถ้าต้องปิดท้ายร้าน → ใส่ร้านไว้ท้าย
 */
function buildSlotsPattern({
  startWithRestaurant,
  endWithRestaurant,
  maxCounts,
  maxStops,
  hours,
}) {
  const slots = [];

  // start
  if (startWithRestaurant && maxCounts.restaurant > 0) {
    slots.push("restaurant");
  }

  // เตรียมกลาง: ดัน A/C เข้าไปก่อน ให้มัน “ไม่ร้านเยอะ”
  // (เราจะ “ไม่ยัดร้านเพิ่ม” ในกลางอยู่แล้ว)
  const middle = [];
  for (let i = 0; i < (maxCounts.attraction || 0); i++) middle.push("attraction");
  for (let i = 0; i < (maxCounts.cafe || 0); i++) middle.push("cafe");

  const shuffledMiddle = shuffle(middle);

  // ถ้าจะปิดท้ายร้าน ให้กันช่องไว้ 1 ช่อง
  const reserveForEnd = endWithRestaurant ? 1 : 0;

  // เติมกลางเข้าไปจนเต็มตาม maxStops
  for (const t of shuffledMiddle) {
    if (slots.length >= maxStops - reserveForEnd) break;
    slots.push(t);
  }

  // ถ้ายังไม่เต็ม (บางที counts น้อย) → เติมแบบสลับ A/C เพิ่มอีกนิด
  // (แต่ยังคุม maxStops)
  while (slots.length < maxStops - reserveForEnd) {
    // สลับง่าย ๆ: attraction ก่อน cafe (เพื่อไม่คาเฟ่รัว)
    slots.push(slots[slots.length - 1] === "cafe" ? "attraction" : "cafe");
  }

  // end restaurant (ถ้ามี)
  if (endWithRestaurant) {
    slots.push("restaurant");
  }

  // กันยาวเกิน
  return slots.slice(0, maxStops);
}

// ------------------------------
// Register
// ------------------------------

app.post("/api/users/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ message: "ข้อมูลไม่ครบ" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email นี้ถูกใช้ไปแล้ว" });

    const savedUser = await new User({ username, email, password }).save();
    res.status(201).json(savedUser);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// ------------------------------
// Login
// ------------------------------

app.post("/api/users/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || user.password !== password)
      return res.status(400).json({ message: "Email หรือรหัสผ่านผิด" });

    res.status(200).json({ message: "ล็อกอินสำเร็จ!", user });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// ------------------------------
// Create Trip
// ------------------------------

function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.post("/api/trips", async (req, res) => {
  try {
    const { trip_name, host_id, budget_money, constraints } = req.body;

    if (!trip_name || !host_id)
      return res.status(400).json({ message: "ข้อมูลไม่ครบ" });

    const savedTrip = await new Trip({
      trip_name,
      host_id,
      budget_money,
      constraints,
      invite_code: generateInviteCode(),
    }).save();

    res.status(201).json(savedTrip);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// ------------------------------
// Join Trip
// ------------------------------

app.post("/api/trips/join", async (req, res) => {
  try {
    const { invite_code, user_id } = req.body;

    const trip = await Trip.findOne({ invite_code });
    if (!trip) return res.status(404).json({ message: "ไม่พบทริป" });

    if (trip.status !== "waiting")
      return res.status(400).json({ message: "ทริปนี้เริ่มไปแล้ว" });

    const exists = await Member.findOne({ trip_id: trip._id, user_id });
    if (!exists) await new Member({ trip_id: trip._id, user_id }).save();

    res.status(200).json({ message: "เข้าร่วมสำเร็จ!", trip_id: trip._id });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// ------------------------------
// Start Trip
// ------------------------------

app.post("/api/trips/:id/start", async (req, res) => {
  try {
    const trip = await Trip.findByIdAndUpdate(
      req.params.id,
      { status: "voting" },
      { new: true }
    );

    if (!trip) return res.status(404).json({ message: "ไม่พบทริป" });

    res.status(200).json({ message: "เริ่มโหวตได้!", trip });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// ------------------------------
// Get Members
// ------------------------------

app.get("/api/trips/:id/members", async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ message: "ไม่พบทริป" });

    const members = await Member.find({ trip_id: req.params.id }).populate(
      "user_id",
      "username email"
    );

    res.status(200).json({
      members: members.map((m) => ({
        user_id: m.user_id._id,
        username: m.user_id.username,
        email: m.user_id.email,
      })),
      trip_status: trip.status,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// ------------------------------
// Update Preferences
// ------------------------------

app.put("/api/users/:id/preferences", async (req, res) => {
  try {
    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { preferences: req.body.preferences },
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ message: "Saved preferences", user: updated });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// ------------------------------
// POI (✅ MOCK MODE)
// ------------------------------
app.get("/api/pois", async (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const query = req.query.q || "";
    const wantType = inferWantedTypeFromQuery(query);

    let list = Array.isArray(mockPois) ? mockPois.slice() : [];

    if (wantType) {
      list = list.filter((p) => typeMatches(p.type, wantType));
    }

    if (!list.length) {
      list = Array.isArray(mockPois) ? mockPois.slice() : [];
    }

    const limit = Number(req.query.limit || 60);
    const out = shuffle(list)
      .slice(0, Math.max(1, Math.min(60, limit)))
      .map((p) => {
        const img =
          safeImageUrl(p.imageUrl, baseUrl) ||
          "https://picsum.photos/seed/fallback/400/300";
        return { ...p, imageUrl: img };
      });

    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ message: "Mock POI Error" });
  }
});

// ------------------------------
// Vote (✅ เก็บ imageUrl ด้วย)
// ------------------------------

app.post("/api/votes", async (req, res) => {
  try {
    const { trip_id, user_id, poi_id, score, imageUrl } = req.body;

    const updated = await Vote.findOneAndUpdate(
      { trip_id, user_id, poi_id },
      { score, imageUrl: imageUrl ?? null },
      { new: true, upsert: true }
    );

    res.status(200).json({ message: "โหวตสำเร็จ!", vote: updated });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// ------------------------------
// Trip Results (✅ ตามชั่วโมงจริง + เติม A/C เมื่อเหลือ + 7h ปิดท้ายร้าน)
// ------------------------------

app.get("/api/trips/:trip_id/results", async (req, res) => {
  const tripId = req.params.trip_id;

  try {
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const trip = await Trip.findById(tripId);
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    const budget = trip.budget_money || 0;
    const constraints = trip.constraints || {};

    const timeLimitMinutes =
      Number(constraints.availableTimeHours || 0) > 0
        ? Number(constraints.availableTimeHours) * 60
        : DEFAULT_TIME_LIMIT_MINUTES;

    // ✅ max distance from constraints แต่ clamp ไม่ให้เกิน sanity cap 20km
    const rawMaxDistanceKm =
      Number(constraints.maxDistanceKm || 0) > 0
        ? Number(constraints.maxDistanceKm)
        : DEFAULT_MAX_DISTANCE_KM;

    const rawMaxLegDistanceKm =
      Number(constraints.maxLegDistanceKm || 0) > 0
        ? Number(constraints.maxLegDistanceKm)
        : rawMaxDistanceKm;

    const maxDistanceKm = clamp(
      rawMaxDistanceKm,
      0.5,
      HARD_SANITY_MAX_DISTANCE_KM
    );
    const maxLegDistanceKm = clamp(
      rawMaxLegDistanceKm,
      0.5,
      HARD_SANITY_MAX_DISTANCE_KM
    );

    const mustHaveRestaurant = constraints.mustHaveRestaurant !== false;
    const preferMix = constraints.preferMix !== false;

    const recipe = buildItineraryRecipe(timeLimitMinutes, budget);
    const hardMaxStops = recipe.maxStops;

    const votes = await Vote.find({ trip_id: tripId });

    if (votes.length === 0) {
      return res.status(200).json({
        tripId,
        totalScore: 0,
        totalCost: 0,
        totalTimeMinutes: 0,
        totalTravelMinutes: 0,
        tripPackage: [],
      });
    }

    // รวมคะแนนแบบ group + เก็บรูป fallback
    const agg = new Map(); // poiId -> { poiId, scores: [], imageUrl }
    for (const v of votes) {
      if (!agg.has(v.poi_id)) {
        agg.set(v.poi_id, { poiId: v.poi_id, scores: [], imageUrl: null });
      }
      const obj = agg.get(v.poi_id);
      obj.scores.push(v.score);
      if (!obj.imageUrl && v.imageUrl) obj.imageUrl = v.imageUrl;
    }

    const poiAgg = Array.from(agg.values()).map((x) => {
      const scores = x.scores || [];
      const sum = scores.reduce((a, b) => a + b, 0);
      const avg = sum / Math.max(1, scores.length);
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      const disagreement = max - min;
      return {
        poiId: x.poiId,
        sum,
        avg,
        min,
        disagreement,
        fallbackImageUrl: x.imageUrl,
      };
    });

    const avgDisagreement =
      poiAgg.reduce((a, b) => a + b.disagreement, 0) / Math.max(1, poiAgg.length);

    const useLeastMisery = avgDisagreement >= 3;

    poiAgg.sort((a, b) => {
      const ka = useLeastMisery ? a.min : a.avg;
      const kb = useLeastMisery ? b.min : b.avg;
      if (kb !== ka) return kb - ka;
      return b.sum - a.sum;
    });

    const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
    const detailsCache = new Map(); // poiId -> details

    async function getPlaceDetails(poiId, fallbackImageUrl, baseUrl) {
      if (detailsCache.has(poiId)) return detailsCache.get(poiId);

      // ✅ 0) ถ้าเป็น mock -> ใช้ข้อมูลจาก mock เลย
      if (mockPoiMap.has(poiId)) {
        const p = mockPoiMap.get(poiId);

        const img =
          safeImageUrl(p.imageUrl, baseUrl) ||
          safeImageUrl(fallbackImageUrl, baseUrl) ||
          "https://picsum.photos/seed/fallback/400/300";

        const details = {
          name: p.name,
          type: p.type,
          imageUrl: img,
          estimatedCost: Number(p.cost || 150),
          lat: Number(p.lat ?? null),
          lng: Number(p.lng ?? null),
        };
        detailsCache.set(poiId, details);
        return details;
      }

      let name = `POI ${poiId}`;
      let type = "attraction";
      let imageUrl =
        safeImageUrl(fallbackImageUrl, baseUrl) ||
        "https://picsum.photos/seed/fallback/400/300";
      let estimatedCost = 150;
      let lat = null;
      let lng = null;

      // ✅ 1) ถ้ามี Google key ค่อยยิง Google
      if (API_KEY) {
        try {
          const url =
            `https://maps.googleapis.com/maps/api/place/details/json` +
            `?place_id=${poiId}` +
            `&fields=name,types,price_level,photos,geometry` +
            `&key=${API_KEY}`;

          const r = await axios.get(url);
          const result = r.data.result || {};

          name = result.name || name;

          const types = result.types || [];
          type = detectTypeFromGoogle(types);

          if (result.photos?.length) {
            const ref = result.photos[0].photo_reference;
            imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${ref}&key=${API_KEY}`;
          }

          estimatedCost = (result.price_level ?? 2) * 150;

          lat = result.geometry?.location?.lat ?? null;
          lng = result.geometry?.location?.lng ?? null;
        } catch (_) {
          // fallback
        }
      }

      imageUrl =
        safeImageUrl(imageUrl, baseUrl) || "https://picsum.photos/seed/fallback/400/300";

      const details = { name, type, imageUrl, estimatedCost, lat, lng };
      detailsCache.set(poiId, details);
      return details;
    }

    // state
    let selected = [];
    let totalCost = 0;
    let totalScore = 0;
    let usedMinutes = 0;
    let totalTravelMinutes = 0;

    let anchor = null;
    let prev = null;

    const selectedIds = new Set();

    const cap = Math.min(poiAgg.length, Math.max(60, hardMaxStops * 30), 250);
    const candidates = poiAgg.slice(0, cap);

    function countSelected(normType) {
      return selected.filter((x) => normalizeType(x.type) === normType).length;
    }

    function lastSelectedNormType() {
      if (!selected.length) return null;
      return normalizeType(selected[selected.length - 1].type);
    }

    async function tryAdd(base, forceType, maxCounts, options = {}) {
      const { allowSameTypeAsPrev = true } = options;

      if (selected.length >= hardMaxStops) return false;
      if (selectedIds.has(base.poiId)) return false;

      const d = await getPlaceDetails(base.poiId, base.fallbackImageUrl, baseUrl);

      if (forceType && !typeMatches(d.type, forceType)) return false;

      // ✅ กัน “ซ้ำหมวดติดกัน” (ยกเว้นเวลาน้อยมาก)
      if (preferMix && timeLimitMinutes > 180 && selected.length > 0 && !allowSameTypeAsPrev) {
        const prevNorm = lastSelectedNormType();
        const curNorm = normalizeType(d.type);
        if (prevNorm && curNorm && prevNorm === curNorm) return false;
      }

      // คุมจำนวนต่อหมวด (ตามเพดาน recipe)
      if (maxCounts) {
        const norm = normalizeType(d.type);
        if (
          maxCounts[norm] != null &&
          countSelected(norm) >= Number(maxCounts[norm])
        ) {
          return false;
        }
      }

      let here = null;
      if (d.lat != null && d.lng != null) {
        here = { lat: d.lat, lng: d.lng };
        if (!anchor) anchor = here;

        const distToAnchor = haversineKm(anchor, here);
        if (distToAnchor != null && distToAnchor > maxDistanceKm) return false;

        if (prev) {
          const distPrev = haversineKm(prev, here);
          if (distPrev != null && distPrev > maxLegDistanceKm) return false;
        }
      }

      let travel = 0;
      let distFromPrevKm = null;

      if (selected.length === 0) {
        travel = 0;
        distFromPrevKm = 0;
      } else if (prev && here) {
        distFromPrevKm = haversineKm(prev, here);
        travel = estimateTravelMinutes(distFromPrevKm);
      } else {
        travel = 10;
        distFromPrevKm = null;
      }

      const stay = estimateStayMinutes(d.type);

      const start = usedMinutes + travel;
      const end = start + stay;

      if (end > timeLimitMinutes) return false;
      if (budget > 0 && totalCost + d.estimatedCost > budget) return false;

      const imgFinal =
        safeImageUrl(d.imageUrl, baseUrl) ||
        safeImageUrl(base.fallbackImageUrl, baseUrl) ||
        "https://picsum.photos/seed/fallback/400/300";

      selected.push({
        poiId: base.poiId,
        name: d.name,
        type: d.type,
        score: base.sum,
        cost: d.estimatedCost,
        imageUrl: imgFinal,

        stayMinutes: stay,
        travelMinutesFromPrev: travel,
        distanceFromPrevKm: distFromPrevKm,
        startMinuteOffset: start,
        endMinuteOffset: end,
      });

      selectedIds.add(base.poiId);
      usedMinutes = end;
      totalTravelMinutes += travel;

      totalScore += base.sum;
      totalCost += d.estimatedCost;

      if (here) prev = here;

      return true;
    }

    async function pickBestOfType(type, maxCounts) {
      // pass 1: ไม่ให้ซ้ำหมวดติดกัน
      for (const base of candidates) {
        const ok = await tryAdd(base, type, maxCounts, {
          allowSameTypeAsPrev: false,
        });
        if (ok) return true;
      }
      // pass 2: ผ่อนให้ซ้ำได้ (กันกรณีหาไม่ได้จริง)
      for (const base of candidates) {
        const ok = await tryAdd(base, type, maxCounts, {
          allowSameTypeAsPrev: true,
        });
        if (ok) return true;
      }
      return false;
    }

    function hasType(type) {
      return selected.some((x) => typeMatches(x.type, type));
    }

    // 1) เดินตาม pattern ที่ recipe สร้างให้
    for (const slotType of recipe.pattern) {
      if (selected.length >= hardMaxStops) break;

      const ok = await pickBestOfType(slotType, recipe.maxCounts);

      // ถ้าหมวดนี้หาไม่ได้จริง ๆ → fallback เป็น attraction (ปลอดภัยสุด)
      if (!ok && slotType !== "restaurant") {
        await pickBestOfType("attraction", recipe.maxCounts);
      }
    }

    // 2) บังคับต้องมีร้าน (ถ้าตั้งค่าไว้)
    if (mustHaveRestaurant && !hasType("restaurant")) {
      let forced = false;

      for (const base of candidates) {
        forced = await tryAdd(base, "restaurant", recipe.maxCounts, {
          allowSameTypeAsPrev: false,
        });
        if (forced) break;
      }
      if (!forced) {
        for (const base of candidates) {
          forced = await tryAdd(base, "restaurant", recipe.maxCounts, {
            allowSameTypeAsPrev: true,
          });
          if (forced) break;
        }
      }

      if (!forced) {
        return res.status(200).json({
          tripId,
          totalScore: 0,
          totalCost: 0,
          totalTimeMinutes: 0,
          totalTravelMinutes: 0,
          tripPackage: [],
          message:
            "ไม่สามารถจัดทริปให้มีร้านอาหารได้ภายใต้งบ/เวลา/ระยะทางที่ตั้งไว้ ลองเพิ่มงบ/เวลา หรือขยาย maxDistanceKm/maxLegDistanceKm",
        });
      }
    }

    // 3) เติมเพิ่ม (เฉพาะถ้ายังไม่เต็ม) โดย “เน้น cafe/attraction” ตาม requirement
    // - 4–6 ชม: ไม่เพิ่ม restaurant อยู่แล้วเพราะ maxCounts.restaurant = 1
    // - 7 ชม+: ถ้าเปิดร้าน 2 ก็จะถูก pattern ใส่ท้ายไว้แล้ว
    for (const base of candidates) {
      if (selected.length >= hardMaxStops) break;

      const lastNorm = lastSelectedNormType();
      const preferType = lastNorm === "cafe" ? "attraction" : "cafe";

      // ลองเติมแบบเลือก A/C ก่อน
      const ok1 = await tryAdd(base, preferType, recipe.maxCounts, {
        allowSameTypeAsPrev: false,
      });
      if (ok1) continue;

      const ok2 = await tryAdd(base, "attraction", recipe.maxCounts, {
        allowSameTypeAsPrev: false,
      });
      if (ok2) continue;

      const ok3 = await tryAdd(base, "cafe", recipe.maxCounts, {
        allowSameTypeAsPrev: false,
      });
      if (ok3) continue;

      // สุดท้ายค่อยยอมแบบไม่ fix type (แต่ยังโดน maxCounts คุมอยู่)
      await tryAdd(base, null, recipe.maxCounts, { allowSameTypeAsPrev: true });
    }

    if (!selected.length) {
      return res.status(200).json({
        tripId,
        totalScore: 0,
        totalCost: 0,
        totalTimeMinutes: 0,
        totalTravelMinutes: 0,
        tripPackage: [],
      });
    }

    return res.status(200).json({
      tripId,
      totalScore,
      totalCost,
      totalTimeMinutes: usedMinutes,
      totalTravelMinutes,

      // debug เผื่อดูว่าคิดอะไร (ลบได้ถ้าไม่อยากโชว์)
      recipe: {
        availableTimeHours: timeLimitMinutes / 60,
        minTargets: recipe.minTargets,
        maxCounts: recipe.maxCounts,
        maxStops: recipe.maxStops,
        pattern: recipe.pattern,
        restaurant2Enabled: recipe.restaurant2Enabled,
        sanity: {
          maxDistanceKm,
          maxLegDistanceKm,
          hardSanityMaxDistanceKm: HARD_SANITY_MAX_DISTANCE_KM,
        },
      },

      tripPackage: selected,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Server Error while calculating results",
      totalScore: 0,
      totalCost: 0,
      totalTimeMinutes: 0,
      totalTravelMinutes: 0,
      tripPackage: [],
    });
  }
});

app.listen(PORT, () => {
  console.log(`Meal Trip Server ทำงานที่ port ${PORT}`);
});