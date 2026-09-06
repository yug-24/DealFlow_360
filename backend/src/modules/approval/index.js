/**
 * approval/index.js — Approval Engine state machine (Rules.md §3, §4)
 *
 * Design note on ApprovalStep: the schema requires `actorId`, so records
 * are only ever created AT THE MOMENT a real decision is made — there is
 * no pre-created "Pending" placeholder row. The "next pending step" is
 * therefore derived on demand: take the required steps for the quotation's
 * LATEST ScoreSnapshot, and find the first stepType that does not yet have
 * an Approved ApprovalStep recorded against that exact snapshot. Because a
 * re-entry always produces a brand-new snapshot with no approvals recorded
 * against it yet, this naturally implements "re-enter from the top" without
 * needing to explicitly supersede old rows.
 */

const { Quotation, ScoreSnapshot, ApprovalStep, AuditLog } = require('../../models');
const { determineBand } = require('../scoring/band');
const { getBandConfigs } = require('../scoring/index');

const BAND_RANK = { none: 0, manager: 1, manager_finance: 2 };
function rank(bandLabel) {
  return BAND_RANK[bandLabel] ?? 0;
}

async function getRequiredSteps(scoreSnapshot) {
  const configs = await getBandConfigs();
  const band = determineBand(scoreSnapshot.blendedScore, configs);
  return band.requiredSteps;
}

/** stepTypes already Approved against this EXACT snapshot version. */
async function getApprovedStepTypes(quotationId, scoreSnapshotId) {
  const rows = await ApprovalStep.find({
    quotationId,
    scoreSnapshotId,
    decision: 'Approved',
  }).lean();
  return rows.map((r) => r.stepType);
}

/** The next actionable step for the quotation's latest snapshot, or null if fully cleared / none required. */
async function getNextPendingStepType(quotationId, scoreSnapshot) {
  const requiredSteps = await getRequiredSteps(scoreSnapshot);
  if (requiredSteps.length === 0) return null;
  const approved = await getApprovedStepTypes(quotationId, scoreSnapshot._id);
  for (const stepType of requiredSteps) {
    if (!approved.includes(stepType)) return stepType;
  }
  return null;
}

/**
 * Called right after scoring.recompute() persists a new ScoreSnapshot.
 * Decides routing per Rules.md §3 (bands -> required steps) and §4 (the
 * re-entry rule): a change that stays within (or below) the
 * previously-approved band proceeds without re-approval; anything that
 * crosses into a HIGHER band forces the quote back to PendingApproval and
 * re-enters the chain from the top of the new band's required steps.
 */
async function routeForApproval(quotationId, scoreSnapshot) {
  const quotation = await Quotation.findById(quotationId);
  if (!quotation) throw new Error('Quotation not found.');

  const requiredSteps = await getRequiredSteps(scoreSnapshot);

  if (requiredSteps.length === 0) {
    // No overage anywhere -> straight through, no approval needed.
    quotation.status = 'Approved';
    quotation.lastApprovedBandLabel = 'none';
    await quotation.save();
    await AuditLog.create({
      entity: 'Quotation',
      entityId: quotation._id,
      action: 'auto_approved_no_overage',
      detail: { blendedScore: scoreSnapshot.blendedScore, scoreSnapshotId: scoreSnapshot._id },
    });
    return quotation;
  }

  const currentRank = rank(scoreSnapshot.bandLabel);
  const lastApprovedRank = quotation.lastApprovedBandLabel ? rank(quotation.lastApprovedBandLabel) : -1;

  if (quotation.lastApprovedBandLabel && currentRank <= lastApprovedRank) {
    // Re-entry rule: the change stayed within (or below) the band already
    // cleared before -> proceed directly, no re-approval needed.
    quotation.status = 'Approved';
    await quotation.save();
    await AuditLog.create({
      entity: 'Quotation',
      entityId: quotation._id,
      action: 'reapproval_skipped_within_band',
      detail: { bandLabel: scoreSnapshot.bandLabel, scoreSnapshotId: scoreSnapshot._id },
    });
    return quotation;
  }

  // Crosses into a higher band than last approved (or was never approved)
  // -> Pending Approval, chain starts fresh at requiredSteps[0] for THIS
  // snapshot (see design note above — no old approvals carry over because
  // they were recorded against a different, now-superseded snapshot).
  quotation.status = 'PendingApproval';
  await quotation.save();
  await AuditLog.create({
    entity: 'Quotation',
    entityId: quotation._id,
    action: 'routed_for_approval',
    detail: { bandLabel: scoreSnapshot.bandLabel, requiredSteps, scoreSnapshotId: scoreSnapshot._id },
  });
  return quotation;
}

/**
 * Approve / Reject / Return for Revision (design.md B4). `reason` is
 * required on Rejected, optional otherwise (Rules.md §3).
 *
 * @param {string} quotationId
 * @param {'Approved'|'Rejected'|'ReturnedForRevision'} decision
 * @param {string} actorId
 * @param {'SalesManager'|'Finance'|'Admin'} actorRole
 * @param {string} [reason]
 */
async function decide(quotationId, decision, actorId, actorRole, reason) {
  if (decision === 'Rejected' && !reason) {
    throw new Error('A reason is required when rejecting.');
  }

  const quotation = await Quotation.findById(quotationId);
  if (!quotation) throw new Error('Quotation not found.');

  const snapshot = await ScoreSnapshot.findOne({ quotationId }).sort('-version');
  if (!snapshot) throw new Error('No score computed for this quotation yet.');

  if (decision === 'ReturnedForRevision') {
    const step = await ApprovalStep.create({
      quotationId,
      scoreSnapshotId: snapshot._id,
      stepType: actorRole === 'Finance' ? 'Finance' : 'SalesManager',
      actorId,
      decision,
      reason: reason || undefined,
      decidedAt: new Date(),
    });
    quotation.status = 'Draft';
    quotation.lastActivityAt = new Date();
    await quotation.save();
    await AuditLog.create({
      entity: 'ApprovalStep',
      entityId: step._id,
      action: decision,
      actorId,
      reason,
      detail: { quotationId },
    });
    return { quotation, step };
  }

  const stepType = await getNextPendingStepType(quotationId, snapshot);
  if (!stepType) throw new Error('No pending approval step for this quotation.');

  if (actorRole !== stepType && actorRole !== 'Admin') {
    throw new Error(`This step requires a ${stepType} decision.`);
  }

  const step = await ApprovalStep.create({
    quotationId,
    scoreSnapshotId: snapshot._id,
    stepType,
    actorId,
    decision,
    reason: reason || undefined,
    decidedAt: new Date(),
  });

  await AuditLog.create({
    entity: 'ApprovalStep',
    entityId: step._id,
    action: decision,
    actorId,
    reason,
    detail: { quotationId, stepType },
  });

  if (decision === 'Rejected') {
    quotation.status = 'Rejected';
  } else if (decision === 'Approved') {
    const nextStepType = await getNextPendingStepType(quotationId, snapshot);
    if (!nextStepType) {
      quotation.status = 'Approved';
      quotation.lastApprovedBandLabel = snapshot.bandLabel;
    }
    // else: stays PendingApproval, the next step is now actionable.
  }

  quotation.lastActivityAt = new Date();
  await quotation.save();

  return { quotation, step };
}

module.exports = { routeForApproval, decide, getNextPendingStepType, getRequiredSteps };
