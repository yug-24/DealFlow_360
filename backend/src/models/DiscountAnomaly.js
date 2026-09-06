const { Schema, model, Types } = require('mongoose');

// Rules.md §7: surfaced on the Deal Health Dashboard independent of
// ceiling breaches — catches "usually gives 5%, suddenly gives 14%" even
// when 14% is technically within a generous ceiling.
const discountAnomalySchema = new Schema(
  {
    quotationId: { type: Types.ObjectId, ref: 'Quotation', required: true },
    lineId: { type: Types.ObjectId, required: true },
    repId: { type: Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true },
    discountPct: { type: Number, required: true },
    repMeanAtTime: { type: Number, required: true },
    repStddevAtTime: { type: Number, required: true },
    zScore: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

discountAnomalySchema.index({ repId: 1, createdAt: -1 });

module.exports = model('DiscountAnomaly', discountAnomalySchema);
