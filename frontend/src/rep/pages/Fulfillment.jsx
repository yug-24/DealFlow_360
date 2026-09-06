import { useEffect, useState } from 'react';
import { api } from '../../shared/api';
import { useQuotationRoom } from '../../shared/socket';
import { Button, Card, ErrorBanner, PageHeader, StatusPill, th, td } from '../../shared/ui';

export default function Fulfillment() {
  const [approved, setApproved] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [quotation, setQuotation] = useState(null);
  const [split, setSplit] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [overrideRows, setOverrideRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    refreshList();
    api.listWarehouses().then(setWarehouses).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useQuotationRoom(selectedId, {
    onFulfillmentUpdated: (payload) => {
      if (String(payload.quotationId) === String(selectedId)) setSplit(payload);
    },
  });

  function refreshList() {
    api
      .listQuotations({ status: 'Approved' })
      .then(setApproved)
      .catch((e) => setError(e.message));
  }

  function loadDetail(id) {
    setError('');
    setOverrideRows(null);
    Promise.all([api.getQuotation(id), api.getFulfillment(id).catch(() => null)]).then(([q, s]) => {
      setQuotation(q);
      setSplit(s);
    });
  }

  async function suggest() {
    setError('');
    try {
      setSplit(await api.suggestFulfillment(selectedId));
    } catch (e) {
      setError(e.message);
    }
  }

  function startOverride() {
    const rows = (quotation?.lines || []).map((l) => ({
      lineId: l._id,
      productId: l.productId,
      productName: l.productName,
      qty: l.qty,
      warehouseId: warehouses[0]?._id || '',
    }));
    setOverrideRows(rows);
  }

  async function submitOverride() {
    setError('');
    try {
      setSplit(
        await api.overrideFulfillment(
          selectedId,
          overrideRows.map((r) => ({ lineId: r.lineId, productId: r.productId, warehouseId: r.warehouseId || null, qty: Number(r.qty) }))
        )
      );
      setOverrideRows(null);
    } catch (e) {
      setError(e.message);
    }
  }

  const allocations = split?.allocations?.filter((a) => !a.isBackorder) || [];
  const backorders = split?.allocations?.filter((a) => a.isBackorder) || [];
  const naiveShipments = quotation?.lines?.length || 0;

  return (
    <div style={{ padding: '32px 40px', display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
      <div>
        <PageHeader title="Fulfillment and Stock" subtitle="Live stock per warehouse, optimized split, manual override." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {approved.map((q) => (
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
          {approved.length === 0 && <Card>No approved quotes awaiting fulfillment.</Card>}
        </div>
      </div>

      <div>
        <ErrorBanner message={error} />
        {!quotation && <Card>Select an approved quote to fulfill.</Card>}

        {quotation && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{quotation.customerId?.name}</div>
              <Button onClick={suggest}>{split?.allocations?.length ? 'Re-suggest Split' : 'Suggest Split'}</Button>
            </div>

            {split?.allocations?.length > 0 && (
              <Card style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, marginBottom: 10, color: '#374151' }}>
                  <strong>{split.shipmentCount} shipment{split.shipmentCount === 1 ? '' : 's'}</strong>
                  {naiveShipments > split.shipmentCount && `, optimized from a possible ${naiveShipments}`}
                  {split.isOverride && <span style={{ marginLeft: 8, color: '#92400e' }}>(manual override)</span>}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Product</th>
                      <th style={th}>Warehouse</th>
                      <th style={th}>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((a, i) => (
                      <tr key={i}>
                        <td style={td}>{a.productId?.name || String(a.productId)}</td>
                        <td style={td}>{a.warehouseId?.name || String(a.warehouseId)}</td>
                        <td style={td}>{a.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {backorders.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#991b1b', marginBottom: 6 }}>Backordered</div>
                    {backorders.map((b, i) => (
                      <div key={i} style={{ fontSize: 13, padding: '6px 8px', background: '#fef2f2', borderRadius: 6, marginBottom: 4 }}>
                        {b.productId?.name || String(b.productId)} — {b.qty} units awaiting stock
                      </div>
                    ))}
                  </div>
                )}

                <Button variant="outline" style={{ marginTop: 12 }} onClick={startOverride}>
                  Manual Override
                </Button>
              </Card>
            )}

            {overrideRows && (
              <Card>
                <h3 style={{ marginTop: 0, fontSize: 14 }}>Manual Override</h3>
                {overrideRows.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, width: 160 }}>{r.productName}</div>
                    <input
                      type="number"
                      value={r.qty}
                      onChange={(e) => {
                        const next = [...overrideRows];
                        next[i] = { ...next[i], qty: e.target.value };
                        setOverrideRows(next);
                      }}
                      style={{ width: 70, padding: '5px 7px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: 13 }}
                    />
                    <select
                      value={r.warehouseId}
                      onChange={(e) => {
                        const next = [...overrideRows];
                        next[i] = { ...next[i], warehouseId: e.target.value };
                        setOverrideRows(next);
                      }}
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 5, border: '1px solid #d1d5db', fontSize: 13 }}
                    >
                      <option value="">Backorder (no warehouse)</option>
                      {warehouses.map((w) => (
                        <option key={w._id} value={w._id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Button onClick={submitOverride}>Save Override</Button>
                  <Button variant="outline" onClick={() => setOverrideRows(null)}>
                    Cancel
                  </Button>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
