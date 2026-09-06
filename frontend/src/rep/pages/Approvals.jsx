import { useEffect, useState } from 'react';
import { api, getProfile } from '../../shared/api';
import { useQuotationRoom } from '../../shared/socket';
import { Button, Card, ErrorBanner, PageHeader, ScoreBadge, StatusPill, th, td } from '../../shared/ui';

export default function Approvals() {
  const profile = getProfile();
  const [pending, setPending] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [quotation, setQuotation] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [steps, setSteps] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [explanation, setExplanation] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [reasonModal, setReasonModal] = useState(null); // 'reject' | 'return' | null
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    refreshList();
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useQuotationRoom(selectedId, {
    onScoreUpdated: (payload) => {
      if (String(payload.quotationId) === String(selectedId)) setSnapshot(payload.snapshot);
    },
    onStatusChanged: () => {
      if (selectedId) loadDetail(selectedId);
      refreshList();
    },
  });

  function refreshList() {
    api
      .listQuotations({ status: 'PendingApproval' })
      .then(setPending)
      .catch((e) => setError(e.message));
  }

  function loadDetail(id) {
    setError('');
    setExplanation(null);
    setShowExplanation(false);
    Promise.all([api.getQuotation(id), api.getScore(id), api.getApprovalSteps(id), api.getAuditLog(id)]).then(
      ([q, s, st, log]) => {
        setQuotation(q);
        setSnapshot(s);
        setSteps(st);
        setAuditLog(log);
      }
    );
  }

  async function loadExplanation() {
    setShowExplanation(true);
    if (explanation) return;
    try {
      setExplanation(await api.getExplanation(selectedId));
    } catch (e) {
      setError(e.message);
    }
  }

  async function decide(action) {
    setError('');
    try {
      if (action === 'approve') await api.approveQuotation(selectedId);
      if (action === 'reject') await api.rejectQuotation(selectedId, reason);
      if (action === 'return') await api.returnForRevision(selectedId, reason);
      setReasonModal(null);
      setReason('');
      refreshList();
      loadDetail(selectedId);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={{ padding: '32px 40px', display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
      <div>
        <PageHeader title="Approvals" subtitle="Quotes pending Manager or Finance sign-off." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pending.map((q) => (
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
              <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>{q.lines?.length} line(s)</div>
            </button>
          ))}
          {pending.length === 0 && <Card>Nothing pending approval right now.</Card>}
        </div>
      </div>

      <div>
        <ErrorBanner message={error} />
        {!quotation && <Card>Select a quote to review.</Card>}

        {quotation && snapshot && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{quotation.customerId?.name}</div>
                <StatusPill status={quotation.status} />
              </div>
              <ScoreBadge score={snapshot.blendedScore} bandLabel={snapshot.bandLabel} />
            </div>

            <Card style={{ marginBottom: 14 }}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Score Breakdown</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Line</th>
                    <th style={th}>Category</th>
                    <th style={th}>Given</th>
                    <th style={th}>Ceiling</th>
                    <th style={th}>Overage</th>
                    <th style={th}>Weighted Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.breakdown.map((b, i) => (
                    <tr key={i}>
                      <td style={td}>{b.productName}</td>
                      <td style={td}>{b.category}</td>
                      <td style={td}>{b.discountGivenPct}%</td>
                      <td style={td}>{b.ceilingPct}%</td>
                      <td style={td}>{b.overagePts}</td>
                      <td style={td}>{b.weightedContribution.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button
                onClick={loadExplanation}
                style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: '#4338ca', padding: 0 }}
              >
                {showExplanation ? 'Hide' : '✦ Show'} AI Explanation
              </button>
              {showExplanation && explanation && (
                <div style={{ marginTop: 8, padding: 10, background: '#eef2ff', borderRadius: 8, fontSize: 13, color: '#3730a3' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    AI Explanation ({explanation.source === 'llm' ? 'generated' : 'template'})
                  </div>
                  {explanation.text}
                </div>
              )}
            </Card>

            <Card style={{ marginBottom: 14 }}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Approval Steps</h3>
              {steps.length === 0 && <div style={{ fontSize: 13, color: '#6b7280' }}>No decisions recorded yet.</div>}
              {steps.map((s) => (
                <div key={s._id} style={{ fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <strong>{s.stepType}</strong> — {s.decision} by {s.actorId?.name || 'unknown'}
                  {s.reason && <span style={{ color: '#6b7280' }}> ("{s.reason}")</span>}
                </div>
              ))}

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                {['SalesManager', 'Finance', 'Admin'].includes(profile?.role) ? (
                  <>
                    <Button onClick={() => decide('approve')}>Approve</Button>
                    <Button variant="danger" onClick={() => setReasonModal('reject')}>
                      Reject
                    </Button>
                    <Button variant="outline" onClick={() => setReasonModal('return')}>
                      Return for Revision
                    </Button>
                  </>
                ) : (
                  <div style={{ fontSize: 12.5, color: '#9ca3af' }}>Only Managers/Finance/Admin can decide on this step.</div>
                )}
              </div>

              {reasonModal && (
                <div style={{ marginTop: 12, padding: 12, border: '1px dashed #d1d5db', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                    Reason {reasonModal === 'reject' ? '(required)' : '(optional)'}
                  </div>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    style={{ width: '100%', borderRadius: 6, border: '1px solid #d1d5db', padding: 8, fontSize: 13, boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <Button onClick={() => decide(reasonModal)}>Submit</Button>
                    <Button variant="outline" onClick={() => setReasonModal(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Audit Trail</h3>
              {auditLog.map((a) => (
                <div key={a._id} style={{ fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid #f3f4f6', color: '#374151' }}>
                  <span style={{ color: '#9ca3af' }}>{new Date(a.createdAt).toLocaleString()}</span> — {a.action}
                  {a.actorId?.name && ` by ${a.actorId.name}`}
                </div>
              ))}
              {auditLog.length === 0 && <div style={{ fontSize: 13, color: '#6b7280' }}>No activity recorded yet.</div>}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
