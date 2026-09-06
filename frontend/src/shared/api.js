const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

function getToken() {
  return localStorage.getItem('df360_token');
}

export function setSession(token, profile) {
  localStorage.setItem('df360_token', token);
  localStorage.setItem('df360_profile', JSON.stringify(profile));
}

export function clearSession() {
  localStorage.removeItem('df360_token');
  localStorage.removeItem('df360_profile');
}

export function getProfile() {
  try {
    return JSON.parse(localStorage.getItem('df360_profile') || 'null');
  } catch {
    return null;
  }
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // no JSON body
  }
  if (!res.ok) {
    const message = body?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

const get = (path) => request(path);
const post = (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) });
const patch = (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data) });

export const api = {
  // --- Auth ---
  login: (email, password) => post('/auth/login', { email, password }),
  portalLogin: (email, password) => post('/auth/portal-login', { email, password }),
  me: () => get('/me'),

  // --- Catalog / config (read-only) ---
  listProducts: () => get('/products'),
  listCustomers: () => get('/customers'),
  listDiscountCeilings: () => get('/discount-ceilings'),
  listApprovalChainConfig: () => get('/approval-chain-config'),
  listWarehouses: () => get('/warehouses'),
  listStockLevels: () => get('/stock-levels'),

  // --- Quotations (Phase 2) ---
  createQuotation: (data) => post('/quotations', data),
  listQuotations: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get(`/quotations${qs ? `?${qs}` : ''}`);
  },
  getQuotation: (id) => get(`/quotations/${id}`),
  patchLines: (id, data) => patch(`/quotations/${id}/lines`, data),
  getScore: (id) => get(`/quotations/${id}/score`),
  getScoreHistory: (id) => get(`/quotations/${id}/score-history`),
  getUpsells: (id) => get(`/quotations/${id}/upsells`),

  // --- Approvals (Phase 2) ---
  getApprovalSteps: (id) => get(`/quotations/${id}/approval-steps`),
  getNextApprovalStep: (id) => get(`/quotations/${id}/next-approval-step`),
  getAuditLog: (id) => get(`/quotations/${id}/audit-log`),
  approveQuotation: (id, reason) => post(`/quotations/${id}/approve`, { reason }),
  rejectQuotation: (id, reason) => post(`/quotations/${id}/reject`, { reason }),
  returnForRevision: (id, reason) => post(`/quotations/${id}/return-for-revision`, { reason }),

  // --- Fulfillment (Phase 3) ---
  getFulfillment: (id) => get(`/quotations/${id}/fulfillment`),
  suggestFulfillment: (id) => post(`/quotations/${id}/fulfillment/suggest`, {}),
  overrideFulfillment: (id, rows) => post(`/quotations/${id}/fulfillment/override`, { rows }),

  // --- Billing / Subscriptions (Phase 4) ---
  getBillingSchedule: (id) => get(`/quotations/${id}/billing-schedule`),
  listInvoices: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return get(`/invoices${qs ? `?${qs}` : ''}`);
  },
  previewProration: (id, billingScheduleId, newQty) =>
    post(`/quotations/${id}/billing/proration-preview`, { billingScheduleId, newQty }),
  applyProration: (id, billingScheduleId, newQty) =>
    post(`/quotations/${id}/billing/proration`, { billingScheduleId, newQty }),
  cancelSubscription: (id, subscriptionPlanId) => post(`/quotations/${id}/billing/cancel`, { subscriptionPlanId }),

  // --- Customer Portal (Phase 5) ---
  portalListQuotations: () => get('/portal/quotations'),
  portalGetQuotation: (id) => get(`/portal/quotations/${id}`),
  portalCounter: (id, lineChanges, requestedDeliveryDate) =>
    post(`/portal/quotations/${id}/counter`, { lineChanges, requestedDeliveryDate }),
  portalConfirm: (id) => post(`/portal/quotations/${id}/confirm`, {}),

  // --- Dashboard (Phase 6) ---
  getDealHealth: () => get('/dashboard/deal-health'),
  getDashboardSummary: () => get('/dashboard/summary'),

  // --- Explanation / Resolution Agent (Phase 7) ---
  getExplanation: (id) => get(`/quotations/${id}/explanation`),
  getResolutionSuggestions: (id) => post(`/quotations/${id}/resolution-suggestions`, {}),
};
