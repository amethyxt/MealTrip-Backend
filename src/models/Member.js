// models/Member.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// พิมพ์เขียวสำหรับ "สมาชิก"
const memberSchema = new Schema({
    trip_id: {
        type: Schema.Types.ObjectId,
        ref: 'Trip', // อ้างอิงถึง Model 'Trip'
        required: true
    },
    user_id: {
        type: Schema.Types.ObjectId,
        ref: 'User', // อ้างอิงถึง Model 'User'
        required: true
    }
}, { timestamps: true });

// Mongoose จะสร้าง Collection ชื่อ 'members'
const Member = mongoose.model('Member', memberSchema);

module.exports = Member;