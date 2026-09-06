import { useEffect, useState } from 'react';
import { api } from '../../shared/api';
import { useQuotationRoom } from '../../shared/socket';
import { Button, Card, ErrorBanner, PageHeader, StatusPill, th, td } from '../../shared/ui';

export default function Subscriptions() {
  const [quotations, setQuotations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [quotation, setQuotation] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [plans, setPlans] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [prorationForm, setProrationForm] = useState(null); // { scheduleId, newQty, preview }
  const [error, setError] = useState('');

  useEffect(() => {
    // Recurring lines only really exist on Confirmed quotes (billing
    // artifacts are generated at confirmation) — but we show Approved too
    // so a rep can find the quote before the customer confirms.
    Promise.all([api.listQuotations({ status: 'Confirmed' }), api.listQuotations({ status: 'Approved' })])
      .then(([a, b]) => setQuotations([...a, ...b]))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useQuotationRoom(selectedId, {
    onBillingUpdated: () => selectedId && loadDetail(selectedId),
  });

  function loadDetail(id) {
    setError('');
    setProrationForm(null);
    Promise.all([api.getQuotation(id), api.getBillingSchedule(id)]).then(([q, b]) => {
      setQuotation(q);
      setSchedules(b.schedules);
      setPlans(b.plans);
      setInvoices(b.invoices);
    });
  }

  function openProrationForm(schedule) {
    const plan = plans.find((p) => String(p._id) === String(schedule.subscriptionPlanId));
    setProrationForm({ scheduleId: schedule._id, newQty: plan?.qty ?? 1, preview: null });
  }

  async function previewProration() {
    setError('');
    try {
      const preview = await api.previewProration(selectedId, prorationForm.scheduleId, Number(prorationForm.newQty));
      setProrationForm((f) => ({ ...f, preview }));
    } catch (e) {
      setError(e.message);
    }
  }

  async function confirmProration() {
    setError('');
    try {
      await api.applyProration(selectedId, prorationForm.scheduleId, Number(prorationForm.newQty));
      setProrationForm(null);
      loadDetail(selectedId);
    } catch (e) {
      setError(e.message);
    }
  }

  const oneTimeLines = quotation?.lines?.filter((l) => l.lineType === 'one_time') || [];
  const recurringLines = quotation?.lines?.filter((l) => l.lineType === 'recurring') || [];

  return (
    <div style={{ padding: '32px 40px', display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
      <div>
        <PageHeader title="Subscriptions and Billing" subtitle="One-time invoices, recurring cycles, mid-cycle proration." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {quotations.map((q) => (
            <button
              key={q._id}
              onClick={() => setSelectedId(q._id)}
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid ' + (selectedId === q._id ? '#111827' : '#e5e7eb'),
                background: selectedId === q._id ? '#f9fafb' : '#fff',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{q.customerId?.name}</div>
              <StatusPill status={q.status} />
            </button>
          ))}
          {quotations.length === 0 && <Card>No approved/confirmed quotes yet.</Card>}
        </div>
      </div>

      <div>
        <ErrorBanner message={error} />
        {!quotation && <Card>Select a quote to view its billing.</Card>}

        {quotation && (
          <>
            <Card style={{ marginBottom: 14 }}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>One-Time Lines</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Product</th>
                    <th style={th}>Qty</th>
                    <th style={th}>Unit Price</th>
                  </tr>
                </thead>
                <tbody>
                  {oneTimeLines.map((l) => (
                    <tr key={l._id}>
                      <td style={td}>{l.productName}</td>
                      <td style={td}>{l.qty}</td>
                      <td style={td}>${l.unitPrice.toFixed(2)}</td>
                    </tr>
                  ))}
                  {oneTimeLines.length === 0 && (
                    <tr>
                      <td style={td} colSpan={3}>
                        None on this quote.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>

            <Card style={{ marginBottom: 14 }}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Recurring Lines</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                <thead>
                  <tr>
                    <th style={th}>Product</th>
                    <th style={th}>Qty</th>
                    <th style={th}>Unit Price</th>
                  </tr>
                </thead>
                <tbody>
                  {recurringLines.map((l) => (
                    <tr key={l._id}>
                      <td style={td}>{l.productName}</td>
                      <td style={td}>{l.qty}</td>
                      <td style={td}>${l.unitPrice.toFixed(2)}</td>
                    </tr>
                  ))}
                  {recurringLines.length === 0 && (
                    <tr>
                      <td style={td} colSpan={3}>
                        None on this quote.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Billing Cycle Timeline</div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                {schedules.map((s) => (
                  <div key={s._id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, minWidth: 180 }}>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {new Date(s.periodStart).toLocaleDateString()} – {new Date(s.periodEnd).toLocaleDateString()}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>${s.amount.toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.status}</div>
                    {s.prorationAdjustment && (
                      <div style={{ fontSize: 11, color: '#4338ca', marginTop: 4 }}>
                        Adjustment: {s.prorationAdjustment.amount >= 0 ? '+' : ''}
                        ${s.prorationAdjustment.amount.toFixed(2)}
                      </div>
                    )}
                    <Button variant="subtle" style={{ marginTop: 8, width: '100%', fontSize: 11.5, padding: '5px 8px' }} onClick={() => openProrationForm(s)}>
                      Change Quantity
                    </Button>
                  </div>
                ))}
                {schedules.length === 0 && <div style={{ fontSize: 13, color: '#6b7280' }}>No billing cycles yet — confirm the quote to generate one.</div>}
              </div>

              {prorationForm && (
                <div style={{ marginTop: 14, padding: 12, border: '1px dashed #d1d5db', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>New quantity</div>
                  <input
                    type="number"
                    min={0}
                    value={prorationForm.newQty}
                    onChange={(e) => setProrationForm((f) => ({ ...f, newQty: e.target.value, preview: null }))}
                    style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                  />
                  <Button variant="outline" style={{ marginLeft: 8 }} onClick={previewProration}>
                    Preview
                  </Button>
                  {prorationForm.preview && (
                    <div style={{ marginTop: 8, fontSize: 13, color: '#374151' }}>
                      {prorationForm.preview.amount >= 0 ? '+' : ''}
                      ${prorationForm.preview.amount.toFixed(2)} this period ({prorationForm.preview.daysRemaining}/
                      {prorationForm.preview.totalDaysInPeriod} days remaining)
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <Button onClick={confirmProration} disabled={!prorationForm.preview}>
                      Confirm Change
                    </Button>
                    <Button variant="outline" onClick={() => setProrationForm(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Invoices for this quote</h3>
              {invoices.map((inv) => (
                <div key={inv._id} style={{ fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <strong>{inv.invoiceNumber}</strong> — ${inv.amount.toFixed(2)} — {inv.status}
                </div>
              ))}
              {invoices.length === 0 && <div style={{ fontSize: 13, color: '#6b7280' }}>None yet.</div>}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
