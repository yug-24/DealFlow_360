const { Schema, model, Types } = require('mongoose');

const subscriptionPlanSchema = new Schema(
  {
    productId: { type: Types.ObjectId, ref: 'Product', required: true },
    quotationId: { type: Types.ObjectId, ref: 'Quotation', required: true },
    customerId: { type: Types.ObjectId, ref: 'Customer', required: true },
    cycle: { type: String, enum: ['monthly', 'quarterly', 'yearly'], required: true },
    qty: { type: Number, required: true, default: 1 },
    unitPrice: { type: Number, required: true },
    status: { type: String, enum: ['Active', 'Paused', 'Cancelled'], default: 'Active' },
    nextBillDate: { type: Date },
  },
  { timestamps: true }
);

subscriptionPlanSchema.index({ customerId: 1, status: 1 });

module.exports = model('SubscriptionPlan', subscriptionPlanSchema);
