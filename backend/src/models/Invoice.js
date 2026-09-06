const { Schema, model, Types } = require('mongoose');

// Promoted to a first-class collection (not just a BillingSchedule
// projection) so partial-invoicing-vs-partial-delivery reconciliation
// (wireframe Screen 13) has somewhere to live, matching the Invoices
// top-level nav tab shown in the wireframe.
const invoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true }, // e.g. "INV-1042"
    quotationId: { type: Types.ObjectId, ref: 'Quotation', required: true },
    customerId: { type: Types.ObjectId, ref: 'Customer', required: true },
    billingScheduleId: { type: Types.ObjectId, ref: 'BillingSchedule', default: null }, // null for one-time lines
    isRecurring: { type: Boolean, default: false },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['Unpaid', 'Paid'], default: 'Unpaid' },
    dueDate: { type: Date, required: true },
    deliveryStatus: {
      type: String,
      enum: ['OrderConfirmed', 'Shipped', 'Invoiced', 'Paid'],
      default: 'OrderConfirmed',
    },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

invoiceSchema.index({ customerId: 1, status: 1 });
invoiceSchema.index({ quotationId: 1 });

module.exports = model('Invoice', invoiceSchema);
