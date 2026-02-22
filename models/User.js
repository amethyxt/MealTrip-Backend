// models/User.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// พิมพ์เขียวสำหรับ "ผู้ใช้"
const userSchema = new Schema({
    username: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true // อีเมลต้องไม่ซ้ำกัน
    },
    password: {
        type: String,
        required: true
    },
    // ▼▼▼ (เพิ่มส่วนนี้) ช่องเก็บรสนิยม (Tag) ▼▼▼
    preferences: {
        type: [String], // เก็บเป็นลิสต์คำ เช่น ["cafe", "temple", "nature"]
        default: []     // เริ่มต้นเป็นค่าว่าง
    }
    // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
}, { timestamps: true });

// Mongoose จะสร้าง Collection ชื่อ 'users'
const User = mongoose.model('User', userSchema);

module.exports = User;