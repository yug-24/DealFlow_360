import { useEffect, useState } from 'react';
import { api } from '../../shared/api';
import { useQuotationRoom } from '../../shared/socket';
import { Button, Card, ErrorBanner, LiveValue, PageHeader, StatusPill, th, td } from '../../shared/ui';

// design.md §4.5: no internal margin/cost data, no numeric score — just a
// plain status. This screen never imports ScoreBadge for that reason.
export default function MyQuotation() {
  const [quotations, setQuotations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [quotation, setQuotation] = useState(null);
  const [counterChanges, setCounterChanges] = useState({});
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    api
      .portalListQuotations()
      .then((list) => {
        setQuotations(list);
        if (list.length > 0) setSelectedId(list[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (selectedId) load(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useQuotationRoom(selectedId, {
    onStatusChanged: (payload) => {
      if (String(payload.quotationId) === String(selectedId)) load(selectedId);
    },
    onScoreUpdated: (payload) => {
      if (String(payload.quotationId) === String(selectedId)) load(selectedId);
    },
  });

  function load(id) {
    setError('');
    api.portalGetQuotation(id).then(setQuotation).catch((e) => setError(e.message));
  }

  async function submitCounter() {
    const lineChanges = Object.entries(counterChanges).map(([lineId, discountPct]) => ({ lineId, discountPct: Number(discountPct) }));
    if (lineChanges.length === 0) return;
    setError('');
    setInfo('');
    try {
      const updated = await api.portalCounter(selectedId, lineChanges);
      setQuotation(updated);
      setCounterChanges({});
      setInfo('Your request was submitted — status is now "Under Negotiation."');
    } catch (e) {
      setError(e.message);
    }
  }

  async function confirm() {
    setError('');
    setInfo('');
    try {
      await api.portalConfirm(selectedId);
      load(selectedId);
      setInfo('Quotation confirmed — invoices are being generated.');
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 760, margin: '0 auto' }}>
      <PageHeader title="My Quotation" subtitle="Review your quote, request changes, and confirm when you're ready." />
      <ErrorBanner message={error} />
      {info && <div style={{ background: '#eef2ff', color: '#3730a3', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{info}</div>}

      {quotations.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {quotations.map((q) => (
            <button
              key={q.id}
              onClick={() => setSelectedId(q.id)}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid ' + (selectedId === q.id ? '#111827' : '#d1d5db'), background: selectedId === q.id ? '#111827' : '#fff', color: selectedId === q.id ? '#fff' : '#374151', fontSize: 12.5, cursor: 'pointer' }}
            >
              Quote #{q.id.slice(-6)}
            </button>
          ))}
        </div>
      )}

      {!quotation && <Card>No quotation to show yet.</Card>}

      {quotation && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <StatusPill status={quotation.status} />
            <div style={{ fontSize: 18, fontWeight: 700 }}>Total: <LiveValue value={`$${quotation.total.toFixed(2)}`} /></div>
          </div>
          {quotation.reviewNotice && <div style={{ background: '#fef3c7', color: '#92400e', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{quotation.reviewNotice}</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Product</th><th style={th}>Qty</th><th style={th}>Unit Price</th><th style={th}>Discount</th><th style={th}>Request New Discount %</th>
              </tr>
            </thead>
            <tbody>
              {quotation.lines.map((l) => (
                <tr key={l.id}>
                  <td style={td}>{l.productName}</td><td style={td}>{l.qty}</td><td style={td}>${l.unitPrice.toFixed(2)}</td><td style={td}>{l.discountPct}%</td>
                  <td style={td}><input type="number" min={0} placeholder={`${l.discountPct}`} value={counterChanges[l.id] ?? ''} onChange={(e) => setCounterChanges((prev) => ({ ...prev, [l.id]: e.target.value }))} style={{ width: 70, padding: '5px 7px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: 13 }} disabled={quotation.status === 'Confirmed'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <Button variant="outline" onClick={submitCounter} disabled={Object.keys(counterChanges).length === 0 || quotation.status === 'Confirmed'}>
              Submit Request
            </Button>
            <Button onClick={confirm} disabled={quotation.status !== 'Approved'}>Confirm Quotation</Button>
          </div>
          {quotation.status !== 'Approved' && quotation.status !== 'Confirmed' && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>You can confirm once this quotation clears internal review.</div>}
        </Card>
      )}
    </div>
  );
}
