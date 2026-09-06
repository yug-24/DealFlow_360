const { Schema, model } = require('mongoose');

const variantSchema = new Schema(
  {
    attribute: { type: String, required: true }, // e.g. "Color", "RAM"
    values: [{ type: String }], // e.g. ["Blue", "Black"]
    extraPrice: { type: Number, default: 0 },
  },
  { _id: false }
);

const productSchema = new Schema(
  {
    name: { type: String, required: true },
    category: { type: String, required: true }, // drives ceiling + margin (Rules.md §1)
    type: {
      type: String,
      enum: ['Hardware', 'Service', 'Subscription'],
      required: true,
    },
    price: { type: Number, required: true },
    cost: { type: Number, default: 0 },
    unit: { type: String, default: 'Each' },
    taxPct: { type: Number, default: 0 },
    isRecurring: { type: Boolean, default: false },
    recurringCycle: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly', null],
      default: null,
    },
    variants: [variantSchema],
    status: { type: String, enum: ['Active', 'Archived'], default: 'Active' },
  },
  { timestamps: true }
);

module.exports = model('Product', productSchema);
