const { Schema, model, Types } = require('mongoose');

// Rules.md §7: rolling mean/stddev of historical discount % per (rep, category).
// Updated incrementally (Welford's algorithm) in the service layer so we
// never recompute over full history on every new line.
const repDiscountBaselineSchema = new Schema(
  {
    repId: { type: Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true },
    count: { type: Number, default: 0 },
    mean: { type: Number, default: 0 },
    m2: { type: Number, default: 0 }, // Welford's running sum of squared diffs
  },
  { timestamps: true }
);

repDiscountBaselineSchema.index({ repId: 1, category: 1 }, { unique: true });

// Virtual: sample standard deviation, not stored directly.
repDiscountBaselineSchema.virtual('stddev').get(function () {
  return this.count > 1 ? Math.sqrt(this.m2 / (this.count - 1)) : 0;
});

module.exports = model('RepDiscountBaseline', repDiscountBaselineSchema);
