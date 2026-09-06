const { Schema, model } = require('mongoose');

const customerSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true }, // portal login
    tier: { type: String, enum: ['Bronze', 'Silver', 'Gold'], required: true, default: 'Bronze' },
    company: { type: String },
  },
  { timestamps: true }
);

module.exports = model('Customer', customerSchema);
