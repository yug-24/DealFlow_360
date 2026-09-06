const express = require('express');
const bcrypt = require('bcryptjs');
const { Types } = require('mongoose');
const router = express.Router();

const {
  User,
  Customer,
  Product,
  DiscountCeiling,
  ApprovalChainConfig,
  Quotation,
  ScoreSnapshot,
  ApprovalStep,
  AuditLog,
  Warehouse,
  StockLevel,
  FulfillmentSplit,
  SubscriptionPlan,
  BillingSchedule,
  Invoice,
} = require('../models');

const { requireAuth, requireRole, signToken } = require('../middleware/auth');
const scoring = require('../modules/scoring');
const approval = require('../modules/approval');
const fulfillment = require('../modules/fulfillment');
const billing = require('../modules/billing');
const dashboard = require('../modules/dashboard');
const recommendation = require('../modules/recommendation');
const explanation = require('../modules/explanation');
const resolution = require('../modules/resolution');
const { checkAndRecordAnomaly } = require('../modules/dashboard/anomaly');
const { emitToQuotation } = require('../realtime');

const INTERNAL_ROLES = ['SalesRep', 'SalesManager', 'Finance', 'Admin'];
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

function validateLogin(req, res) {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 200) {
    res.status(400).json({ error: 'A valid email and password are required.' });
    return null;
  }
  const key = `${req.ip}:${email}`;
  const now = Date.now();
  const attempt = loginAttempts.get(key);
  if (attempt && now - attempt.startedAt < LOGIN_WINDOW_MS && attempt.count >= LOGIN_MAX_ATTEMPTS) {
    res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    return null;
  }
  return { email, password };
}

function recordLoginFailure(req, email) {
  const key = `${req.ip}:${email}`;
  const current = loginAttempts.get(key) || { startedAt: Date.now(), count: 0 };
  current.count += 1;
  loginAttempts.set(key, current);
}

function clearLoginFailures(req, email) {
  loginAttempts.delete(`${req.ip}:${email}`);
}

function isValidObjectId(value) {
  return Types.ObjectId.isValid(value);
}

router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'dealflow360-backend', phase: 7 });
});

// ---------------------------------------------------------------------
// Auth (A1) — simple JWT, role claims. Internal users vs. Customer portal.
// ---------------------------------------------------------------------
router.post('/auth/login', async (req, res, next) => {
  try {
    const credentials = validateLogin(req, res);
    if (!credentials) return;
    const { email, password } = credentials;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
          recordLoginFailure(req, email);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
        clearLoginFailures(req, email);
    res.json({ token: signToken(user, user.role), user: { id: user._id, name: user.name, role: user.role } });
  } catch (err) {
    next(err);
  }
});

router.post('/auth/portal-login', async (req, res, next) => {
  try {
    const credentials = validateLogin(req, res);
    if (!credentials) return;
    const { email, password } = credentials;
    const customer = await Customer.findOne({ email });
    if (!customer || !(await bcrypt.compare(password, customer.passwordHash))) {
      recordLoginFailure(req, email);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    clearLoginFailures(req, email);
    res.json({
      token: signToken(customer, 'Customer'),
      customer: { id: customer._id, name: customer.name, tier: customer.tier },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => res.json(req.user));

// ---------------------------------------------------------------------
// Admin backend config (A2-A5) — read-only in this drop (write forms are
// out of the critical demo path per Phases.md cut priority).
// ---------------------------------------------------------------------
router.get('/products', requireAuth, requireRole(...INTERNAL_ROLES), async (req, res, next) => {
  try {
    res.json(await Product.find({ status: 'Active' }).sort({ category: 1, name: 1 }));
  } catch (err) {
    next(err);
  }
});

router.get('/customers', requireAuth, requireRole(...INTERNAL_ROLES), async (req, res, next) => {
  try {
    res.json(await Customer.find().sort({ name: 1 }).select('-passwordHash'));
  } catch (err) {
    next(err);
  }
});

router.get('/discount-ceilings', requireAuth, requireRole(...INTERNAL_ROLES), async (req, res, next) => {
  try {
    res.json(await DiscountCeiling.find().sort({ tier: 1, category: 1 }));
  } catch (err) {
    next(err);
  }
});

router.get('/approval-chain-config', requireAuth, requireRole(...INTERNAL_ROLES), async (req, res, next) => {
  try {
    res.json(await ApprovalChainConfig.find().sort({ minScore: 1 }));
  } catch (err) {
    next(err);
  }
});

router.get('/warehouses', requireAuth, requireRole(...INTERNAL_ROLES), async (req, res, next) => {
  try {
    res.json(await Warehouse.find().sort({ name: 1 }));
  } catch (err) {
    next(err);
  }
});

router.get('/stock-levels', requireAuth, requireRole(...INTERNAL_ROLES), async (req, res, next) => {
  try {
    res.json(await StockLevel.find().populate('warehouseId', 'name shippingWeight').populate('productId', 'name category'));
  } catch (err) {
    next(err);
  }
});

// Invoices as a first-class, cross-quotation list (wireframe Screens 12-13
// treat Invoices as its own top-level tab, separate from per-quote billing).
router.get('/invoices', requireAuth, requireRole(...INTERNAL_ROLES), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    res.json(
      await Invoice.find(filter)
        .sort({ createdAt: -1 })
        .limit(200)
        .populate('customerId', 'name tier')
        .populate('quotationId', 'status')
    );
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Shared orchestration: every line mutation must recompute the score AND
// re-evaluate approval routing (Architecture.md §5-7), then broadcast.
// ---------------------------------------------------------------------
async function recomputeAndRoute(quotationId, triggeredBy) {
  const snapshot = await scoring.recompute(quotationId, { triggeredBy });
  const quotation = await approval.routeForApproval(quotationId, snapshot);
  emitToQuotation(quotationId, 'score_updated', { quotationId, snapshot, status: quotation.status });
  return { snapshot, quotation };
}

function enrichLine(product, input) {
  return {
    productId: product._id,
    productName: product.name,
    category: product.category,
    lineType: input.lineType || (product.isRecurring ? 'recurring' : 'one_time'),
    qty: input.qty,
    unitPrice: product.price,
    discountPct: input.discountPct || 0,
  };
}

// ---------------------------------------------------------------------
// Quotations (Phase 1-2) — Builder (B3) + List (B2)
// ---------------------------------------------------------------------
router.post('/quotations', requireAuth, requireRole('SalesRep', 'Admin'), async (req, res, next) => {
  try {
    const { customerId, lines = [] } = req.body;
    if (!isValidObjectId(customerId) || !Array.isArray(lines) || lines.length === 0 || lines.length > 100) {
      return res.status(400).json({ error: 'A customer and between 1 and 100 quotation lines are required.' });
    }

    const enrichedLines = await Promise.all(
      lines.map(async (l) => {
        const product = await Product.findById(l.productId);
        if (!product) throw Object.assign(new Error(`Unknown product ${l.productId}`), { status: 400 });
        return enrichLine(product, l);
      })
    );

    const quotation = await Quotation.create({
      customerId,
      assignedRepId: req.user.id,
      lines: enrichedLines,
      status: 'Draft',
    });

    await AuditLog.create({ entity: 'Quotation', entityId: quotation._id, action: 'created', actorId: req.user.id });

    // Rep discount anomaly check (Rules.md §7) — independent of ceiling breaches.
    for (const line of quotation.lines) {
      await checkAndRecordAnomaly({
        repId: req.user.id,
        category: line.category,
        discountPct: line.discountPct,
        quotationId: quotation._id,
        lineId: line._id,
      });
    }

    const { snapshot } = await recomputeAndRoute(quotation._id, 'initial_create');
    res.status(201).json({ quotation: await Quotation.findById(quotation._id), snapshot });
  } catch (err) {
    next(err);
  }
});

router.get('/quotations', requireAuth, requireRole(...INTERNAL_ROLES), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.customerId) filter.customerId = req.query.customerId;
    res.json(await Quotation.find(filter).sort({ updatedAt: -1 }).limit(200).populate('customerId', 'name tier'));
  } catch (err) {
    next(err);
  }
});

router.get('/quotations/:id', requireAuth, requireRole(...INTERNAL_ROLES), async (req, res, next) => {
  try {
    const quotation = await Quotation.findById(req.params.id).populate('customerId', 'name tier email');
    if (!quotation) return res.status(404).json({ error: 'Quotation not found.' });
    res.json(quotation);
  } catch (err) {
    next(err);
  }
});

router.patch('/quotations/:id/lines', requireAuth, requireRole('SalesRep', 'Admin'), async (req, res, next) => {
  try {
    const { add = [], update = [], removeLineIds = [] } = req.body;
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ error: 'Quotation not found.' });

    for (const lineId of removeLineIds) quotation.lines.id(lineId)?.deleteOne();

    for (const u of update) {
      const line = quotation.lines.id(u.lineId);
      if (!line) continue;
      if (u.qty !== undefined) line.qty = u.qty;
      if (u.discountPct !== undefined) line.discountPct = u.discountPct;
    }

    const newLines = [];
    for (const a of add) {
      const product = await Product.findById(a.productId);
      if (!product) throw Object.assign(new Error(`Unknown product ${a.productId}`), { status: 400 });
      quotation.lines.push(enrichLine(product, a));
      newLines.push(quotation.lines[quotation.lines.length - 1]);
    }

    quotation.lastActivityAt = new Date();
    await quotation.save();

    await AuditLog.create({
      entity: 'Quotation',
      entityId: quotation._id,
      action: 'lines_updated',
      actorId: req.user.id,
      detail: { added: add.length, updated: update.length, removed: removeLineIds.length },
    });

    // Anomaly check for newly-added lines and any line whose discount changed.
    for (const line of newLines) {
      await checkAndRecordAnomaly({
        repId: req.user.id,
        category: line.category,
        discountPct: line.discountPct,
        quotationId: quotation._id,
        lineId: line._id,
      });
    }
    for (const u of update) {
      if (u.discountPct === undefined) continue;
      const line = quotation.lines.id(u.lineId);
      if (!line) continue;
      await checkAndRecordAnomaly({
        repId: req.user.id,
        category: line.category,
        discountPct: u.discountPct,
        quotationId: quotation._id,
        lineId: line._id,
      });
    }

    const { snapshot } = await recomputeAndRoute(quotation._id, 'rep_edit');
    res.json({ quotation: await Quotation.findById(quotation._id), snapshot });
  } catch (err) {
    next(err);
  }
});

router.get('/quotations/:id/score', requireAuth, async (req, res, next) => {
  try {
    const snapshot = await ScoreSnapshot.findOne({ quotationId: req.params.id }).sort('-version');
    if (!snapshot) return res.status(404).json({ error: 'No score computed yet.' });
    res.json(snapshot);
  } catch (err) {
    next(err);
  }
});

router.get('/quotations/:id/score-history', requireAuth, async (req, res, next) => {
  try {
    res.json(await ScoreSnapshot.find({ quotationId: req.params.id }).sort({ version: 1 }));
  } catch (err) {
    next(err);
  }
});

router.get('/quotations/:id/upsells', requireAuth, async (req, res, next) => {
  try {
    res.json(await recommendation.suggestUpsells(req.params.id));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Approvals (Phase 2) — Discount Approval Screen (B4)
// ---------------------------------------------------------------------
router.get('/quotations/:id/approval-steps', requireAuth, async (req, res, next) => {
  try {
    res.json(await ApprovalStep.find({ quotationId: req.params.id }).sort({ createdAt: 1 }).populate('actorId', 'name role'));
  } catch (err) {
    next(err);
  }
});

router.get('/quotations/:id/next-approval-step', requireAuth, async (req, res, next) => {
  try {
    const snapshot = await ScoreSnapshot.findOne({ quotationId: req.params.id }).sort('-version');
    if (!snapshot) return res.json({ stepType: null });
    res.json({ stepType: await approval.getNextPendingStepType(req.params.id, snapshot) });
  } catch (err) {
    next(err);
  }
});

router.get('/quotations/:id/audit-log', requireAuth, async (req, res, next) => {
  try {
    const stepIds = (await ApprovalStep.find({ quotationId: req.params.id }).select('_id')).map((s) => s._id);
    const rows = await AuditLog.find({
      $or: [
        { entity: 'Quotation', entityId: req.params.id },
        { entity: 'ApprovalStep', entityId: { $in: stepIds } },
      ],
    })
      .sort({ createdAt: 1 })
      .populate('actorId', 'name role');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/quotations/:id/approve', requireAuth, requireRole('SalesManager', 'Finance', 'Admin'), async (req, res, next) => {
  try {
    const result = await approval.decide(req.params.id, 'Approved', req.user.id, req.user.role, req.body.reason);
    emitToQuotation(req.params.id, 'status_changed', { quotationId: req.params.id, status: result.quotation.status });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/quotations/:id/reject', requireAuth, requireRole('SalesManager', 'Finance', 'Admin'), async (req, res, next) => {
  try {
    if (!req.body.reason) return res.status(400).json({ error: 'A reason is required to reject.' });
    const result = await approval.decide(req.params.id, 'Rejected', req.user.id, req.user.role, req.body.reason);
    emitToQuotation(req.params.id, 'status_changed', { quotationId: req.params.id, status: result.quotation.status });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/quotations/:id/return-for-revision',
  requireAuth,
  requireRole('SalesManager', 'Finance', 'Admin'),
  async (req, res, next) => {
    try {
      const result = await approval.decide(req.params.id, 'ReturnedForRevision', req.user.id, req.user.role, req.body.reason);
      emitToQuotation(req.params.id, 'status_changed', { quotationId: req.params.id, status: result.quotation.status });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------
// Fulfillment (Phase 3) — Warehouse Split Screen (B6)
// ---------------------------------------------------------------------
router.get('/quotations/:id/fulfillment', requireAuth, async (req, res, next) => {
  try {
    const split = await FulfillmentSplit.findOne({ quotationId: req.params.id })
      .populate('allocations.warehouseId', 'name shippingWeight')
      .populate('allocations.productId', 'name');
    res.json(split || { allocations: [], shipmentCount: 0, estimatedCost: 0, status: null });
  } catch (err) {
    next(err);
  }
});

router.post('/quotations/:id/fulfillment/suggest', requireAuth, requireRole('SalesRep', 'Admin'), async (req, res, next) => {
  try {
    res.json(await fulfillment.suggestSplit(req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post('/quotations/:id/fulfillment/override', requireAuth, requireRole('SalesRep', 'Admin'), async (req, res, next) => {
  try {
    // rows: [{ lineId, productId, warehouseId, qty }] — warehouseId null/omitted = backorder
    res.json(await fulfillment.override(req.params.id, req.body.rows, req.user.id));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Billing / Subscriptions (Phase 4) — Subscription & Billing Screen (B7)
// ---------------------------------------------------------------------
router.get('/quotations/:id/billing-schedule', requireAuth, async (req, res, next) => {
  try {
    const [schedules, invoices, plans] = await Promise.all([
      BillingSchedule.find({ quotationId: req.params.id }).sort({ periodStart: 1 }),
      Invoice.find({ quotationId: req.params.id }).sort({ issuedAt: 1, createdAt: 1 }),
      SubscriptionPlan.find({ quotationId: req.params.id }),
    ]);
    res.json({ schedules, invoices, plans });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/quotations/:id/billing/proration-preview',
  requireAuth,
  requireRole('SalesRep', 'Admin'),
  async (req, res, next) => {
    try {
      const { billingScheduleId, newQty } = req.body;
      const schedule = await BillingSchedule.findById(billingScheduleId);
      const plan = schedule && (await SubscriptionPlan.findById(schedule.subscriptionPlanId));
      if (!schedule || !plan) return res.status(404).json({ error: 'Billing cycle not found.' });

      const now = new Date();
      const totalDaysInPeriod = Math.max(1, Math.round((schedule.periodEnd - schedule.periodStart) / 86400000));
      const daysRemaining = Math.max(0, Math.round((schedule.periodEnd - now) / 86400000));
      const amount = (newQty - plan.qty) * plan.unitPrice * (daysRemaining / totalDaysInPeriod);
      res.json({ preview: true, amount, daysRemaining, totalDaysInPeriod });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/quotations/:id/billing/proration', requireAuth, requireRole('SalesRep', 'Admin'), async (req, res, next) => {
  try {
    const { billingScheduleId, newQty } = req.body;
    res.json(await billing.applyProration(billingScheduleId, newQty));
  } catch (err) {
    next(err);
  }
});

router.post('/quotations/:id/billing/cancel', requireAuth, requireRole('SalesRep', 'Finance', 'Admin'), async (req, res, next) => {
  try {
    res.json(await billing.cancelPlan(req.body.subscriptionPlanId));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Customer Portal (Phase 5) — Negotiation Screen (B8)
// ---------------------------------------------------------------------
function toPortalView(quotation, snapshot) {
  return {
    id: quotation._id,
    status: quotation.status,
    requestedDeliveryDate: quotation.requestedDeliveryDate,
    lines: quotation.lines.map((l) => ({
      id: l._id,
      productName: l.productName,
      qty: l.qty,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
      lineType: l.lineType,
    })),
    total: quotation.lines.reduce((sum, l) => sum + l.qty * l.unitPrice * (1 - l.discountPct / 100), 0),
    // Never expose the internal numeric score or "blended risk score" verbatim (design.md §4.5, §6).
    reviewNotice: snapshot && snapshot.bandLabel !== 'none' ? 'This request needs a quick internal review' : null,
  };
}

router.get('/portal/quotations', requireAuth, requireRole('Customer'), async (req, res, next) => {
  try {
    const quotations = await Quotation.find({ customerId: req.user.id }).sort({ updatedAt: -1 });
    res.json(quotations.map((q) => toPortalView(q)));
  } catch (err) {
    next(err);
  }
});

router.get('/portal/quotations/:id', requireAuth, requireRole('Customer'), async (req, res, next) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ error: 'Quotation not found.' });
    if (String(quotation.customerId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not your quotation.' });
    }
    const snapshot = await ScoreSnapshot.findOne({ quotationId: quotation._id }).sort('-version');
    res.json(toPortalView(quotation, snapshot));
  } catch (err) {
    next(err);
  }
});

router.post('/portal/quotations/:id/counter', requireAuth, requireRole('Customer'), async (req, res, next) => {
  try {
    const { lineChanges = [], requestedDeliveryDate = null } = req.body; // [{ lineId, discountPct }]
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ error: 'Quotation not found.' });
    if (String(quotation.customerId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not your quotation.' });
    }

    for (const change of lineChanges) {
      const line = quotation.lines.id(change.lineId);
      if (line && change.discountPct !== undefined) line.discountPct = change.discountPct;
    }

    // Full ("comment/counter") activity resets the stall clock — a passive
    // view does not (Rules.md §8).
    quotation.status = 'UnderNegotiation';
    quotation.lastActivityAt = new Date();
    if (requestedDeliveryDate !== null) {
      quotation.requestedDeliveryDate = requestedDeliveryDate || null;
    }
    await quotation.save();

    await AuditLog.create({
      entity: 'Quotation',
      entityId: quotation._id,
      action: 'portal_counter_submitted',
      actorId: req.user.id,
      detail: { lineChanges },
    });
    emitToQuotation(quotation._id, 'status_changed', { quotationId: quotation._id, status: 'UnderNegotiation' });

    const { snapshot, quotation: routed } = await recomputeAndRoute(quotation._id, 'portal_counter');
    res.json(toPortalView(routed, snapshot));
  } catch (err) {
    next(err);
  }
});

router.post('/portal/quotations/:id/confirm', requireAuth, requireRole('Customer'), async (req, res, next) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ error: 'Quotation not found.' });
    if (String(quotation.customerId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not your quotation.' });
    }
    if (quotation.status !== 'Approved') {
      return res
        .status(409)
        .json({ error: `Cannot confirm from status "${quotation.status}" — approval must clear first.` });
    }

    quotation.status = 'Confirmed';
    quotation.lastActivityAt = new Date();
    await quotation.save();

    await AuditLog.create({ entity: 'Quotation', entityId: quotation._id, action: 'confirmed_by_customer', actorId: req.user.id });

    const billingResult = await billing.generateSchedule(quotation._id);
    emitToQuotation(quotation._id, 'status_changed', { quotationId: quotation._id, status: 'Confirmed' });

    res.json({ quotation, billing: billingResult });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Dashboard (Phase 6) — Deal Health & Anomaly Dashboard (B9)
// ---------------------------------------------------------------------
router.get('/dashboard/deal-health', requireAuth, requireRole('SalesManager', 'Finance', 'Admin'), async (req, res, next) => {
  try {
    res.json(await dashboard.getDealHealth());
  } catch (err) {
    next(err);
  }
});

router.get('/dashboard/summary', requireAuth, requireRole(...INTERNAL_ROLES), async (req, res, next) => {
  try {
    res.json(await dashboard.getSummary());
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// Explanation / Resolution Agent (Phase 7)
// ---------------------------------------------------------------------
router.get('/quotations/:id/explanation', requireAuth, async (req, res, next) => {
  try {
    const snapshot = await ScoreSnapshot.findOne({ quotationId: req.params.id }).sort('-version');
    if (!snapshot) return res.status(404).json({ error: 'No score computed yet.' });
    res.json({ snapshotVersion: snapshot.version, ...(await explanation.generateExplanation(snapshot)) });
  } catch (err) {
    next(err);
  }
});

router.post('/quotations/:id/resolution-suggestions', requireAuth, async (req, res, next) => {
  try {
    res.json({ suggestions: await resolution.proposeResolutions(req.params.id) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
