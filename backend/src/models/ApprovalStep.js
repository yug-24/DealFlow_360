const { Schema, model, Types } = require('mongoose');

const approvalStepSchema = new Schema(
  {
    quotationId: { type: Types.ObjectId, ref: 'Quotation', required: true },
    scoreSnapshotId: { type: Types.ObjectId, ref: 'ScoreSnapshot', required: true },
    stepType: { type: String, enum: ['SalesManager', 'Finance'], required: true },
    actorId: { type: Types.ObjectId, ref: 'User', required: true },
    decision: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'ReturnedForRevision'],
      required: true,
      default: 'Pending',
    },
    reason: { type: String }, // required at the service layer on reject
    decidedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

approvalStepSchema.index({ quotationId: 1, createdAt: 1 });

module.exports = model('ApprovalStep', approvalStepSchema);
