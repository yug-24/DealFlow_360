const { Schema, model } = require('mongoose');

const priceListSchema = new Schema(
  {
    tier: { type: String, enum: ['Bronze', 'Silver', 'Gold'], required: true },
    currency: { type: String, default: 'USD' },
    rule: {
      type: String,
      enum: ['none', 'percent_off_base'],
      default: 'none',
    },
    ruleValuePct: { type: Number, default: 0 }, // e.g. Gold = 10% off base
  },
  { timestamps: true }
);

priceListSchema.index({ tier: 1, currency: 1 }, { unique: true });

module.exports = model('PriceList', priceListSchema);
