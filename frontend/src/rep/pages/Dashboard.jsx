import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getProfile } from '../../shared/api';
import { Card, PageHeader, StatusPill, ErrorBanner } from '../../shared/ui';

export default function Dashboard() {
  const profile = getProfile();
  const isManagerOrFinance = ['SalesManager', 'Finance', 'Admin'].includes(profile?.role);

  const [quotations, setQuotations] = useState([]);
  const [health, setHealth] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listQuotations().then(setQuotations).catch((e) => setError(e.message));
    api.getDashboardSummary().then(setSummary).catch((e) => setError(e.message));
    if (isManagerOrFinance) {
      api.getDealHealth().then(setHealth).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingApproval = quotations.filter((q) => q.status === 'PendingApproval');
  const open = quotations.filter((q) => !['Confirmed', 'Rejected'].includes(q.status));

  return (
    <div style={{ padding: '32px 40px' }}>
      <PageHeader
        title="Sales Dashboard"
        subtitle="Central hub — pending approvals, open quotations, at-risk deals, recent activity."
      />
      <ErrorBanner message={error} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <KpiCard label="Total Quotations" value={summary?.quotationCount ?? quotations.length} />
        <KpiCard label="Open Quotations" value={open.length} />
        <KpiCard label="Pending Approval" value={summary?.statusCounts?.PendingApproval ?? pendingApproval.length} accent="#92400e" />
        <KpiCard label="Pipeline Value" value={summary ? `$${summary.totalValue.toLocaleString()}` : '—'} accent="#166534" />
        {isManagerOrFinance && <KpiCard label="Stalled Deals" value={health?.stalledCount ?? '—'} accent="#991b1b" />}
        {isManagerOrFinance && <KpiCard label="Discount Anomalies" value={health?.anomalyCount ?? '—'} accent="#991b1b" />}
      </div>

      <Card>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Recent Quotations</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Customer</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Lines</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {quotations.slice(0, 8).map((q) => (
              <tr key={q._id}>
                <td style={tdStyle}>{q.customerId?.name || '—'}</td>
                <td style={tdStyle}>
                  <StatusPill status={q.status} />
                </td>
                <td style={tdStyle}>{q.lines?.length ?? 0}</td>
                <td style={tdStyle}>
                  <Link to="/app/quotations" state={{ quotationId: q._id }} style={{ fontSize: 12.5 }}>
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
            {quotations.length === 0 && (
              <tr>
                <td style={tdStyle} colSpan={4}>
                  No quotations yet — head to the Quotations tab to build one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
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

const thStyle = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' };
const tdStyle = { padding: '8px 10px', fontSize: 13.5, borderBottom: '1px solid #f3f4f6' };
