import { useEffect, useState } from 'react';
import { api } from '../../shared/api';
import { Card, ErrorBanner, PageHeader, th, td } from '../../shared/ui';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [ceilings, setCeilings] = useState([]);
  const [bands, setBands] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.listProducts(), api.listDiscountCeilings(), api.listApprovalChainConfig()])
      .then(([p, c, b]) => {
        setProducts(p);
        setCeilings(c);
        setBands(b);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div style={{ padding: '32px 40px' }}>
      <PageHeader
        title="Products, Price Lists and Approval Chains"
        subtitle="Admin backend config (A2-A3) — read-only in this build; write forms are out of the critical demo path."
      />
      <ErrorBanner message={error} />

      <Card style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0, fontSize: 14 }}>Products</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Category</th>
              <th style={th}>Price</th>
              <th style={th}>Cost</th>
              <th style={th}>Recurring</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p._id}>
                <td style={td}>{p.name}</td>
                <td style={td}>{p.category}</td>
                <td style={td}>${p.price.toFixed(2)}</td>
                <td style={td}>${p.cost.toFixed(2)}</td>
                <td style={td}>{p.isRecurring ? `Yes (${p.recurringCycle})` : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0, fontSize: 14 }}>Discount Ceilings by Tier</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Tier</th>
              <th style={th}>Category</th>
              <th style={th}>Max Discount %</th>
            </tr>
          </thead>
          <tbody>
            {ceilings.map((c) => (
              <tr key={c._id}>
                <td style={td}>{c.tier}</td>
                <td style={td}>{c.category}</td>
                <td style={td}>{c.maxDiscountPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0, fontSize: 14 }}>Approval Chain Bands</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Band</th>
              <th style={th}>Score Range</th>
              <th style={th}>Required Steps</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => (
              <tr key={b._id}>
                <td style={td}>{b.bandLabel}</td>
                <td style={td}>
                  {b.minScore} – {b.maxScore ?? '∞'}
                </td>
                <td style={td}>{b.requiredSteps.length ? b.requiredSteps.join(' → ') : 'None'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
