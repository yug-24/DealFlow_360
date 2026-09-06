import { Fragment, useEffect, useState } from 'react';
import { api } from '../../shared/api';
import { Button, Card, ErrorBanner, PageHeader, StatusPill, th, td } from '../../shared/ui';

export default function DealHealth() {
  const [health, setHealth] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [suggestions, setSuggestions] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  function load() {
    api.getDealHealth().then(setHealth).catch((e) => setError(e.message));
  }

  async function toggleExpand(quotationId) {
    if (expandedId === quotationId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(quotationId);
    if (!suggestions[quotationId]) {
      try {
        const { suggestions: s } = await api.getResolutionSuggestions(quotationId);
        setSuggestions((prev) => ({ ...prev, [quotationId]: s }));
      } catch (e) {
        setSuggestions((prev) => ({ ...prev, [quotationId]: [] }));
      }
    }
  }

  if (!health) {
    return (
      <div style={{ padding: '32px 40px' }}>
        <ErrorBanner message={error} />
        <Card>Loading…</Card>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 40px' }}>
      <PageHeader title="Deal Health and Anomaly Dashboard" subtitle="Stalled deals, discount anomalies, and delivery slippage — click through to resolve." />
      <ErrorBanner message={error} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        <KpiCard label="Stalled Deals" value={health.stalledCount} accent="#991b1b" />
        <KpiCard label="Discount Anomalies" value={health.anomalyCount} accent="#92400e" />
        <KpiCard label="Delivery Slippage" value={health.slippageCount} accent="#991b1b" />
      </div>

      <Card style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0, fontSize: 14 }}>Stalled Deals</h3>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: -6 }}>
          No activity beyond a passive view for over the stall threshold — expand a deal for AI-suggested resolutions.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Customer</th>
              <th style={th}>Status</th>
              <th style={th}>Last Activity</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {health.stalledDeals.map((q) => (
              <Fragment key={q._id}>
                <tr>
                  <td style={td}>{q.customerId?.name || '—'}</td>
                  <td style={td}>
                    <StatusPill status={q.status} />
                  </td>
                  <td style={td}>{new Date(q.lastActivityAt).toLocaleDateString()}</td>
                  <td style={td}>
                    <Button variant="subtle" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => toggleExpand(q._id)}>
                      {expandedId === q._id ? 'Hide' : 'Resolve'}
                    </Button>
                  </td>
                </tr>
                {expandedId === q._id && (
                  <tr>
                    <td colSpan={4} style={{ ...td, background: '#f9fafb' }}>
                      <ResolutionPanel candidates={suggestions[q._id]} quotationId={q._id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {health.stalledDeals.length === 0 && (
              <tr>
                <td style={td} colSpan={4}>
                  No stalled deals right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0, fontSize: 14 }}>Discount Anomalies</h3>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: -6 }}>
          Flagged independent of ceiling breaches — a rep suddenly discounting far outside their own history.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Category</th>
              <th style={th}>Discount Given</th>
              <th style={th}>Rep Mean</th>
              <th style={th}>z-score</th>
              <th style={th}>When</th>
            </tr>
          </thead>
          <tbody>
            {health.anomalies.map((a) => (
              <tr key={a._id}>
                <td style={td}>{a.category}</td>
                <td style={td}>{a.discountPct}%</td>
                <td style={td}>{a.repMeanAtTime.toFixed(1)}%</td>
                <td style={td}>{a.zScore.toFixed(2)}</td>
                <td style={td}>{new Date(a.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {health.anomalies.length === 0 && (
              <tr>
                <td style={td} colSpan={5}>
                  No anomalies detected.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0, fontSize: 14 }}>Delivery Promise Slippage</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Promised Ship Date</th>
              <th style={th}>Current Projection</th>
              <th style={th}>Delta</th>
            </tr>
          </thead>
          <tbody>
            {health.slippage.map((s, i) => (
              <tr key={i}>
                <td style={td}>{new Date(s.promisedShipDate).toLocaleDateString()}</td>
                <td style={td}>{new Date(s.currentProjectedShipDate).toLocaleDateString()}</td>
                <td style={td}>+{s.deltaDays} days</td>
              </tr>
            ))}
            {health.slippage.length === 0 && (
              <tr>
                <td style={td} colSpan={3}>
                  No slippage beyond the buffer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ResolutionPanel({ candidates, quotationId }) {
  if (!candidates) return <div style={{ fontSize: 13, color: '#6b7280' }}>Loading suggestions…</div>;
  if (candidates.length === 0) return <div style={{ fontSize: 13, color: '#6b7280' }}>No overage on this quote — nothing to resolve.</div>;

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {candidates.map((c, i) => (
        <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, width: 240 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{c.label}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            Re-validated score: <strong>{c.scored.blendedScore.toFixed(1)}</strong> ({c.scored.bandLabel})
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{c.lineChanges.length} line(s) changed</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
            Apply from the Quotations builder ({quotationId.slice(-6)}) to make it live.
          </div>
        </div>
      ))}
    </div>
  );
}

function KpiCard({ label, value, accent }) {
  return (
    <Card>
      <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent || '#111827', marginTop: 4 }}>{value}</div>
    </Card>
  );
}
