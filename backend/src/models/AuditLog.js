const { Schema, model, Types } = require('mongoose');

// Rules.md §11: every mutation to tiers/approval-chain-config/ApprovalStep/
// fulfillment override/billing-proration must write an immutable AuditLog row.
const auditLogSchema = new Schema(
  {
    entity: { type: String, required: true }, // e.g. "Quotation", "ApprovalStep"
    entityId: { type: Types.ObjectId, required: true },
    action: { type: String, required: true }, // e.g. "approve", "override_split"
    actorId: { type: Types.ObjectId, ref: 'User' },
    reason: { type: String },
    detail: { type: Schema.Types.Mixed }, // free-form structured context
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ entity: 1, entityId: 1, createdAt: 1 });

// Guard rails: audit rows are never edited or deleted (Rules.md §11).
['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach(
  (method) => {
    auditLogSchema.pre(method, function (next) {
      next(new Error(`AuditLog is append-only/immutable — ${method} is not permitted.`));
    });
  }
);

module.exports = model('AuditLog', auditLogSchema);
