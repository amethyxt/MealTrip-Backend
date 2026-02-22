// models/Vote.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const voteSchema = new Schema(
  {
    trip_id: {
      type: Schema.Types.ObjectId,
      ref: 'Trip',
      required: true,
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // ID ของสถานที่จาก Google Places
    poi_id: {
      type: String,
      required: true,
    },
    // คะแนน 1–5
    score: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    // 👇 เก็บ URL รูปที่ใช้ตอนโหวต (จะได้เอาไปใช้หน้า Result ได้เหมือนกัน)
    imageUrl: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

const Vote = mongoose.model('Vote', voteSchema);
module.exports = Vote;
