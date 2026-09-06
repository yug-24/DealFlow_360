const { Schema, model, Types } = require('mongoose');

// The Score Snapshot is the architectural spine (Architecture.md §1).
// APPEND-ONLY / IMMUTABLE: never updated after insert, only new versions
// are inserted. Application code must never call updateOne/findOneAndUpdate
// on this collection — enforced below by blocking those methods.
const lineBreakdownSchema = new Schema(
  {
    lineId: { type: Types.ObjectId, required: true },
    productName: { type: String, required: true },
    category: { type: String, required: true },
    discountGivenPct: { type: Number, required: true },
    ceilingPct: { type: Number, required: true },
    overagePts: { type: Number, required: true }, // max(0, given - ceiling)
    lineAmount: { type: Number, required: true },
    lineWeight: { type: Number, required: true }, // lineAmount / totalQuoteAmount
    weightedContribution: { type: Number, required: true }, // overage * weight * SCALE_FACTOR
  },
  { _id: false }
);

const scoreSnapshotSchema = new Schema(
  {
    quotationId: { type: Types.ObjectId, ref: 'Quotation', required: true },
    version: { type: Number, required: true },
    blendedScore: { type: Number, required: true },
    bandLabel: { type: String, required: true }, // "none" | "manager" | "manager_finance"
    breakdown: [lineBreakdownSchema],
    totalQuoteAmount: { type: Number, required: true },
    triggeredBy: {
      type: String,
      enum: ['rep_edit', 'portal_counter', 'initial_create'],
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

scoreSnapshotSchema.index({ quotationId: 1, version: -1 });

// Guard rails: this collection is append-only.
['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach(
  (method) => {
    scoreSnapshotSchema.pre(method, function (next) {
      next(new Error(`ScoreSnapshot is append-only/immutable — ${method} is not permitted.`));
    });
  }
);

module.exports = model('ScoreSnapshot', scoreSnapshotSchema);
