const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    from: { type: String, required: true },
    to: { type: String }, // null or undefined for room messages
    room: { type: String }, // null or undefined for DMs
    text: { type: String, required: true },
    timestamp: {
        type: Date,
        default: Date.now,
        index: { expires: '7d' } // Auto-delete after 7 days
    }
});

module.exports = mongoose.model('Message', messageSchema);
