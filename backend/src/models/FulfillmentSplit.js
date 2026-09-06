const { Schema, model, Types } = require('mongoose');

const allocationLineSchema = new Schema(
  {
    // Phase 3 addition: not required — a backorder row (Rules.md §5) has no
    // warehouse yet, only a remainder qty waiting on stock.
    warehouseId: { type: Types.ObjectId, ref: 'Warehouse', default: null },
    productId: { type: Types.ObjectId, ref: 'Product', required: true },
    qty: { type: Number, required: true },
    isBackorder: { type: Boolean, default: false },
  },
  { _id: false }
);

const fulfillmentSplitSchema = new Schema(
  {
    quotationId: { type: Types.ObjectId, ref: 'Quotation', required: true },
    allocations: [allocationLineSchema],
    shipmentCount: { type: Number, required: true },
    estimatedCost: { type: Number, required: true },
    isOverride: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['SplitPending', 'Split', 'Backorder', 'Fulfilled'],
      default: 'SplitPending',
    },
  },
  { timestamps: true }
);

fulfillmentSplitSchema.index({ quotationId: 1 });

module.exports = model('FulfillmentSplit', fulfillmentSplitSchema);
