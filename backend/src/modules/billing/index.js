/**
 * billing/index.js — Hybrid Billing & Proration Engine (Rules.md §6,
 * Architecture.md §9).
 *
 * One-time lines: invoiced immediately upon confirmation, never touch the
 * proration engine. Recurring lines: a SubscriptionPlan is instantiated per
 * quotation line (this schema ties SubscriptionPlan to quotationId +
 * productId directly, rather than a shared master plan), which then
 * generates BillingSchedule rows per cycle.
 */

const { Quotation, Product, SubscriptionPlan, BillingSchedule, Invoice, AuditLog } = require('../../models');
const { emitToQuotation } = require('../../realtime');
const { recompute } = require('../scoring');

const CYCLE_DAYS = { monthly: 30, quarterly: 91, yearly: 365 };

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function netLineAmount(line) {
  return line.qty * line.unitPrice * (1 - line.discountPct / 100);
}

async function nextInvoiceNumber() {
  const count = await Invoice.countDocuments();
  return `INV-${1000 + count + 1}`;
}

/**
 * Generates all billing artifacts for a just-confirmed quotation: an
 * Invoice per one-time line (grouped into one invoice), and a
 * SubscriptionPlan + first BillingSchedule + Invoice per recurring line.
 */
async function generateSchedule(quotationId) {
  const quotation = await Quotation.findById(quotationId);
  if (!quotation) throw new Error('Quotation not found.');

  const oneTimeLines = quotation.lines.filter((l) => l.lineType === 'one_time');
  const recurringLines = quotation.lines.filter((l) => l.lineType === 'recurring');

  const invoices = [];

  if (oneTimeLines.length > 0) {
    const amount = oneTimeLines.reduce((sum, l) => sum + netLineAmount(l), 0);
    const invoice = await Invoice.create({
      invoiceNumber: await nextInvoiceNumber(),
      quotationId,
      customerId: quotation.customerId,
      billingScheduleId: null,
      isRecurring: false,
      amount,
      status: 'Unpaid',
      dueDate: addDays(new Date(), 14),
      deliveryStatus: 'OrderConfirmed',
    });
    invoices.push(invoice);
    await AuditLog.create({
      entity: 'Invoice',
      entityId: invoice._id,
      action: 'issued',
      detail: { amount, lineCount: oneTimeLines.length, isRecurring: false },
    });
  }

  const schedules = [];
  const plans = [];

  for (const line of recurringLines) {
    const product = await Product.findById(line.productId).lean();
    const cycle = product?.recurringCycle || 'monthly';
    const periodStart = new Date();
    const periodEnd = addDays(periodStart, CYCLE_DAYS[cycle]);

    const plan = await SubscriptionPlan.create({
      productId: line.productId,
      quotationId,
      customerId: quotation.customerId,
      cycle,
      qty: line.qty,
      unitPrice: line.unitPrice,
      status: 'Active',
      nextBillDate: periodEnd,
    });
    plans.push(plan);

    const amount = netLineAmount(line);
    const schedule = await BillingSchedule.create({
      quotationId,
      subscriptionPlanId: plan._id,
      lineId: line._id,
      periodStart,
      periodEnd,
      amount,
      status: 'Scheduled',
    });
    schedules.push(schedule);

    const invoice = await Invoice.create({
      invoiceNumber: await nextInvoiceNumber(),
      quotationId,
      customerId: quotation.customerId,
      billingScheduleId: schedule._id,
      isRecurring: true,
      amount,
      status: 'Unpaid',
      dueDate: periodStart,
      deliveryStatus: 'OrderConfirmed',
    });
    invoices.push(invoice);

    await AuditLog.create({
      entity: 'BillingSchedule',
      entityId: schedule._id,
      action: 'schedule_created',
      detail: { periodStart, periodEnd, amount, cycle },
    });
  }

  const result = { invoices, schedules, plans };
  emitToQuotation(quotationId, 'billing_updated', result);
  return result;
}

/**
 * Mid-cycle quantity change on a recurring line (Rules.md §6):
 *   proration_amount = (new_qty - old_qty) * unit_price * (days_remaining / total_days_in_period)
 * Stores the adjustment on the BillingSchedule row, updates the
 * SubscriptionPlan's qty and the originating Quotation line's qty, issues
 * an adjustment Invoice for the (possibly negative) amount, and re-triggers
 * the deterministic scoring recompute since qty affects line weight.
 */
async function applyProration(billingScheduleId, newQty, changeDate = new Date()) {
  const schedule = await BillingSchedule.findById(billingScheduleId);
  if (!schedule) throw new Error('Billing schedule not found.');
  if (changeDate < schedule.periodStart || changeDate >= schedule.periodEnd) {
    throw new Error('Change date is outside the active billing cycle — cannot prorate.');
  }

  const plan = await SubscriptionPlan.findById(schedule.subscriptionPlanId);
  if (!plan) throw new Error('Subscription plan not found.');

  const oldQty = plan.qty;
  const totalDaysInPeriod = Math.max(1, Math.round((schedule.periodEnd - schedule.periodStart) / 86400000));
  const daysRemaining = Math.max(0, Math.round((schedule.periodEnd - changeDate) / 86400000));
  const amount = (newQty - oldQty) * plan.unitPrice * (daysRemaining / totalDaysInPeriod);

  schedule.prorationAdjustment = { oldQty, newQty, daysRemaining, totalDaysInPeriod, amount, changeDate };
  await schedule.save();

  plan.qty = newQty;
  await plan.save();

  const quotation = await Quotation.findById(schedule.quotationId);
  const line = quotation?.lines.id(schedule.lineId);
  if (line) {
    line.qty = newQty;
    await quotation.save();
  }

  const invoice = await Invoice.create({
    invoiceNumber: await nextInvoiceNumber(),
    quotationId: schedule.quotationId,
    customerId: plan.customerId,
    billingScheduleId: schedule._id,
    isRecurring: true,
    amount,
    status: 'Unpaid',
    dueDate: changeDate,
    deliveryStatus: 'Invoiced',
  });

  await AuditLog.create({
    entity: 'BillingSchedule',
    entityId: schedule._id,
    action: 'proration_applied',
    detail: { oldQty, newQty, amount, daysRemaining, totalDaysInPeriod },
  });

  emitToQuotation(schedule.quotationId, 'billing_updated', { schedule, invoice });

  // Quantity affects each line's value-weighted contribution to the
  // blended score -> must flow back through the deterministic scorer.
  if (line) await recompute(schedule.quotationId, { triggeredBy: 'rep_edit' });

  return { schedule, invoice, amount };
}

/** Cancellation before period end: partial refund/credit using the same day-fraction formula. */
async function cancelPlan(subscriptionPlanId, cancelDate = new Date()) {
  const plan = await SubscriptionPlan.findById(subscriptionPlanId);
  if (!plan) throw new Error('Subscription plan not found.');

  const schedule = await BillingSchedule.findOne({ subscriptionPlanId, status: { $ne: 'Paid' } }).sort('-periodStart');
  if (!schedule) throw new Error('No active billing cycle to cancel.');

  const totalDaysInPeriod = Math.max(1, Math.round((schedule.periodEnd - schedule.periodStart) / 86400000));
  const daysRemaining = Math.max(0, Math.round((schedule.periodEnd - cancelDate) / 86400000));
  const refundAmount = (daysRemaining / totalDaysInPeriod) * schedule.amount;

  schedule.prorationAdjustment = {
    oldQty: plan.qty,
    newQty: 0,
    daysRemaining,
    totalDaysInPeriod,
    amount: -refundAmount,
    changeDate: cancelDate,
  };
  await schedule.save();

  plan.status = 'Cancelled';
  await plan.save();

  await AuditLog.create({
    entity: 'SubscriptionPlan',
    entityId: plan._id,
    action: 'cancelled_with_refund',
    detail: { refundAmount, daysRemaining, totalDaysInPeriod },
  });

  emitToQuotation(schedule.quotationId, 'billing_updated', { schedule, refundAmount });
  return { schedule, refundAmount };
}

module.exports = { generateSchedule, applyProration, cancelPlan, CYCLE_DAYS };
