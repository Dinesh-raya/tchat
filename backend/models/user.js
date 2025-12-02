const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user', enum: ['user', 'admin'] },
    securityKey: { type: String, required: true }
});

module.exports = mongoose.model('User', userSchema);
