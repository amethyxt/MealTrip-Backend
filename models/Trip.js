// 1. เรียกใช้ mongoose
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// 2. สร้าง "พิมพ์เขียว" (Schema) ของเรา
const tripSchema = new Schema({
    trip_name: {
        type: String,
        required: true 
    },
    host_id: {
        type: Schema.Types.ObjectId, 
        ref: 'User' 
    },
    // ▼▼▼ (แก้ตรงนี้) เปลี่ยนสถานะเริ่มต้นเป็น 'waiting' ▼▼▼
    status: {
        type: String,
        default: 'waiting' // รอสมาชิก (ยังไม่เริ่มโหวต)
    },
    // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
    invite_code: {
        type: String,
        unique: true 
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
        type: Object 
    }
}, { timestamps: true }); 

const Trip = mongoose.model('Trip', tripSchema);
module.exports = Trip;