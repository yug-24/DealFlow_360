const { Schema, model, Types } = require('mongoose');

const billingScheduleSchema = new Schema(
  {
    quotationId: { type: Types.ObjectId, ref: 'Quotation', required: true },
    subscriptionPlanId: { type: Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    lineId: { type: Types.ObjectId, required: true }, // originating QuotationLine._id
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['Scheduled', 'Invoiced', 'Paid'], default: 'Scheduled' },
    // Rules.md §6: proration record when qty/plan changes mid-cycle
    prorationAdjustment: {
      type: new Schema(
        {
          oldQty: Number,
          newQty: Number,
          daysRemaining: Number,
          totalDaysInPeriod: Number,
          amount: Number,
          changeDate: Date,
        },
        { _id: false }
      ),
      default: null,
    },
  },
  { timestamps: true }
);

billingScheduleSchema.index({ quotationId: 1, periodStart: 1 });

module.exports = model('BillingSchedule', billingScheduleSchema);
