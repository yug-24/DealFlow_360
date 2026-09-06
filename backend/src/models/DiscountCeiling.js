const { Schema, model } = require('mongoose');

// Rules.md §1: every (CustomerTier, ProductCategory) pair has a max_discount_pct.
const discountCeilingSchema = new Schema(
  {
    tier: { type: String, enum: ['Bronze', 'Silver', 'Gold'], required: true },
    category: { type: String, required: true },
    maxDiscountPct: { type: Number, required: true },
  },
  { timestamps: true }
);

discountCeilingSchema.index({ tier: 1, category: 1 }, { unique: true });

module.exports = model('DiscountCeiling', discountCeilingSchema);
