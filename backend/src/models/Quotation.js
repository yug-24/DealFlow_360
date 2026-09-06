const { Schema, model, Types } = require('mongoose');

// QuotationLine is embedded — always read/written together with its parent
// Quotation, matching how the Builder screen (B3) actually works.
const quotationLineSchema = new Schema(
  {
    productId: { type: Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true }, // denormalized for fast list rendering
    category: { type: String, required: true }, // denormalized, used by scoring
    lineType: { type: String, enum: ['one_time', 'recurring'], default: 'one_time' },
    qty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    discountPct: { type: Number, required: true, default: 0 },
  },
  { _id: true, timestamps: false }
);

const quotationSchema = new Schema(
  {
    customerId: { type: Types.ObjectId, ref: 'Customer', required: true },
    priceListId: { type: Types.ObjectId, ref: 'PriceList' },
    status: {
      type: String,
      enum: [
        'Draft',
        'PendingApproval',
        'Approved',
        'UnderNegotiation',
        'Confirmed',
        'Rejected',
      ],
      default: 'Draft',
    },
    lines: [quotationLineSchema],
    // Denormalized pointer to the currently-approved band, used by the
    // Re-Entry Rule (Rules.md §4) to decide whether a portal counter-offer
    // needs to re-enter approval "from the top".
    lastApprovedBandLabel: { type: String, default: null },
    lastActivityAt: { type: Date, default: Date.now }, // Rules.md §8 stalled-deal rule
    assignedRepId: { type: Types.ObjectId, ref: 'User' },
    // Delivery Promise Slippage (Rules.md §9): promisedShipDate is set once,
    // at the FIRST fulfillment suggestion; currentProjectedShipDate updates
    // on every later recompute (e.g. after a backorder resolves), so drift
    // becomes visible as the delta between the two.
    promisedShipDate: { type: Date, default: null },
    currentProjectedShipDate: { type: Date, default: null },
    requestedDeliveryDate: { type: Date, default: null },
  },
  { timestamps: true }
);

quotationSchema.index({ status: 1 });
quotationSchema.index({ customerId: 1 });
quotationSchema.index({ lastActivityAt: 1 });

module.exports = model('Quotation', quotationSchema);
