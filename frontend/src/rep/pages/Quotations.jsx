import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../shared/api';
import { useQuotationRoom } from '../../shared/socket';
import { Button, Card, ErrorBanner, LiveValue, PageHeader, ScoreBadge, StatusPill, th, td } from '../../shared/ui';

export default function Quotations() {
  const location = useLocation();
  const [quotations, setQuotations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState(location.state?.quotationId || null);
  const [quotation, setQuotation] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [upsells, setUpsells] = useState([]);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [error, setError] = useState('');

  // new-line form state
  const [newProductId, setNewProductId] = useState('');
  const [newQty, setNewQty] = useState(1);
  const [newDiscount, setNewDiscount] = useState(0);
  // new-quote form state
  const [newCustomerId, setNewCustomerId] = useState('');

  useEffect(() => {
    refreshList();
    api.listCustomers().then(setCustomers).catch(() => {});
    api.listProducts().then(setProducts).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedId) loadQuotation(selectedId);
    else {
      setQuotation(null);
      setSnapshot(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useQuotationRoom(selectedId, {
    onScoreUpdated: (payload) => {
      if (String(payload.quotationId) === String(selectedId)) {
        setSnapshot(payload.snapshot);
        setQuotation((q) => (q ? { ...q, status: payload.status } : q));
      }
    },
  });

  function refreshList() {
    api.listQuotations().then(setQuotations).catch((e) => setError(e.message));
  }

  function loadQuotation(id) {
    setError('');
    Promise.all([api.getQuotation(id), api.getScore(id).catch(() => null), api.getUpsells(id).catch(() => [])]).then(
      ([q, s, u]) => {
        setQuotation(q);
        setSnapshot(s);
        setUpsells(u);
      }
    );
  }

  async function createDraft() {
    if (!newCustomerId) return setError('Pick a customer first.');
    setError('');
    try {
      const { quotation: q } = await api.createQuotation({ customerId: newCustomerId, lines: [] });
      refreshList();
      setSelectedId(q._id);
    } catch (e) {
      setError(e.message);
    }
  }

  async function addLine() {
    if (!newProductId || !selectedId) return;
    setError('');
    try {
      await api.patchLines(selectedId, { add: [{ productId: newProductId, qty: Number(newQty), discountPct: Number(newDiscount) }] });
      setNewProductId('');
      setNewQty(1);
      setNewDiscount(0);
      loadQuotation(selectedId);
      refreshList();
    } catch (e) {
      setError(e.message);
    }
  }

  async function updateLine(lineId, patch) {
    setError('');
    try {
      await api.patchLines(selectedId, { update: [{ lineId, ...patch }] });
      loadQuotation(selectedId);
    } catch (e) {
      setError(e.message);
    }
  }

  async function removeLine(lineId) {
    setError('');
    try {
      await api.patchLines(selectedId, { removeLineIds: [lineId] });
      loadQuotation(selectedId);
      refreshList();
    } catch (e) {
      setError(e.message);
    }
  }

  async function addUpsell(productId) {
    setError('');
    try {
      await api.patchLines(selectedId, { add: [{ productId, qty: 1, discountPct: 0 }] });
      loadQuotation(selectedId);
    } catch (e) {
      setError(e.message);
    }
  }

  const total = quotation?.lines?.reduce((s, l) => s + l.qty * l.unitPrice * (1 - l.discountPct / 100), 0) ?? 0;
  const margin =
    quotation?.lines?.length && products.length
      ? computeMargin(quotation.lines, products)
      : null;

  const primaryActionLabel =
    !snapshot || snapshot.bandLabel === 'none' ? 'Ready for Fulfillment' : 'Sent to Approval';

  return (
    <div style={{ padding: '32px 40px', display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24 }}>
      <div>
        <PageHeader title="Quotations" />
        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>New Quotation</div>
          <select value={newCustomerId} onChange={(e) => setNewCustomerId(e.target.value)} style={selectStyle}>
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} ({c.tier})
              </option>
            ))}
          </select>
          <Button onClick={createDraft} style={{ width: '100%', marginTop: 8 }}>
            + Create Draft
          </Button>
        </Card>

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
              <div style={{ fontSize: 13, fontWeight: 600 }}>{q.customerId?.name || 'Unknown'}</div>
              <div style={{ marginTop: 4 }}>
                <StatusPill status={q.status} />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <ErrorBanner message={error} />
        {!quotation && <Card>Select or create a quotation to open the Builder.</Card>}

        {quotation && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{quotation.customerId?.name}</div>
                <StatusPill status={quotation.status} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{primaryActionLabel}</div>
                <ScoreBadge score={snapshot?.blendedScore} bandLabel={snapshot?.bandLabel} />
              </div>
            </div>

            <Card style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 8 }}>
                <span>
                  Order Total: <LiveValue value={`$${total.toFixed(2)}`} style={{ fontWeight: 600 }} />
                </span>
                {margin !== null && (
                  <span>
                    Margin: <LiveValue value={`${margin.toFixed(1)}%`} style={{ fontWeight: 600 }} />
                  </span>
                )}
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Product</th>
                    <th style={th}>Category</th>
                    <th style={th}>Qty</th>
                    <th style={th}>Unit Price</th>
                    <th style={th}>Discount %</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {quotation.lines.map((l) => (
                    <tr key={l._id}>
                      <td style={td}>{l.productName}</td>
                      <td style={td}>{l.category}</td>
                      <td style={td}>
                        <input
                          type="number"
                          min={1}
                          defaultValue={l.qty}
                          onBlur={(e) => Number(e.target.value) !== l.qty && updateLine(l._id, { qty: Number(e.target.value) })}
                          style={miniInput}
                        />
                      </td>
                      <td style={td}>${l.unitPrice.toFixed(2)}</td>
                      <td style={td}>
                        <input
                          type="number"
                          min={0}
                          defaultValue={l.discountPct}
                          onBlur={(e) =>
                            Number(e.target.value) !== l.discountPct && updateLine(l._id, { discountPct: Number(e.target.value) })
                          }
                          style={miniInput}
                        />
                      </td>
                      <td style={td}>
                        <button onClick={() => removeLine(l._id)} style={{ color: '#dc2626', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12 }}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  {quotation.lines.length === 0 && (
                    <tr>
                      <td style={td} colSpan={6}>
                        No lines yet — add one below.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                <select value={newProductId} onChange={(e) => setNewProductId(e.target.value)} style={{ ...selectStyle, flex: 2 }}>
                  <option value="">Add product…</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} — ${p.price} ({p.category})
                    </option>
                  ))}
                </select>
                <input type="number" min={1} value={newQty} onChange={(e) => setNewQty(e.target.value)} style={{ ...miniInput, width: 60 }} placeholder="Qty" />
                <input
                  type="number"
                  min={0}
                  value={newDiscount}
                  onChange={(e) => setNewDiscount(e.target.value)}
                  style={{ ...miniInput, width: 70 }}
                  placeholder="Disc %"
                />
                <Button onClick={addLine}>Add Line</Button>
              </div>
            </Card>

            {snapshot && snapshot.breakdown.some((b) => b.overagePts > 0) && (
              <Card style={{ marginBottom: 14 }}>
                <button
                  onClick={() => setShowBreakdown((s) => !s)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}
                >
                  {showBreakdown ? '▾' : '▸'} Score Breakdown
                </button>
                {showBreakdown && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
                    <thead>
                      <tr>
                        <th style={th}>Line</th>
                        <th style={th}>Given %</th>
                        <th style={th}>Allowed %</th>
                        <th style={th}>Overage (pts)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.breakdown
                        .filter((b) => b.overagePts > 0)
                        .map((b, i) => (
                          <tr key={i}>
                            <td style={td}>{b.productName}</td>
                            <td style={td}>{b.discountGivenPct}%</td>
                            <td style={td}>{b.ceilingPct}%</td>
                            <td style={td}>{b.overagePts}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </Card>
            )}

            {upsells.length > 0 && (
              <Card>
                <h3 style={{ marginTop: 0, fontSize: 14 }}>Upsell & Cross-Sell</h3>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {upsells.map((u) => (
                    <div key={u.productId} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, width: 180 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>${u.price} · margin +${u.marginDelta}</div>
                      <Button variant="subtle" style={{ marginTop: 8, width: '100%' }} onClick={() => addUpsell(u.productId)}>
                        Add to Quote
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function computeMargin(lines, products) {
  const byId = Object.fromEntries(products.map((p) => [p._id, p]));
  let revenue = 0;
  let cost = 0;
  for (const l of lines) {
    const net = l.qty * l.unitPrice * (1 - l.discountPct / 100);
    revenue += net;
    const productCost = byId[l.productId]?.cost ?? byId[l.productId?._id]?.cost ?? 0;
    cost += productCost * l.qty;
  }
  if (revenue === 0) return 0;
  return ((revenue - cost) / revenue) * 100;
}

const selectStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 };
const miniInput = { width: 70, padding: '5px 7px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: 13 };
