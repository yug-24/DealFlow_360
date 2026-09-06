const { Schema, model } = require('mongoose');

// Rules.md §3: score band -> required approval steps.
// Kept as configurable documents, never hardcoded in service logic.
const approvalChainConfigSchema = new Schema(
  {
    bandLabel: { type: String, required: true }, // e.g. "none", "manager", "manager_finance"
    minScore: { type: Number, required: true },
    maxScore: { type: Number, default: null }, // null = open-ended (16+)
    requiredSteps: [{ type: String, enum: ['SalesManager', 'Finance'] }],
  },
  { timestamps: true }
);

module.exports = model('ApprovalChainConfig', approvalChainConfigSchema);
