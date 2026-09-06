import { useEffect, useState } from 'react';
import { api } from '../../shared/api';
import { Card, ErrorBanner, PageHeader, th, td } from '../../shared/ui';

const STATUS_FILTERS = ['All', 'Unpaid', 'Paid'];

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [filter, setFilter] = useState('All');
  const [error, setError] = useState('');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  function load() {
    api
      .listInvoices(filter === 'All' ? {} : { status: filter })
      .then(setInvoices)
      .catch((e) => setError(e.message));
  }

  return (
    <div style={{ padding: '32px 40px' }}>
      <PageHeader
        title="Invoices"
        subtitle="One-time and recurring invoices across all quotations — reconciles against delivery/fulfillment status."
        actions={STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid ' + (filter === f ? '#111827' : '#d1d5db'),
              background: filter === f ? '#111827' : '#fff',
              color: filter === f ? '#fff' : '#374151',
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            {f}
          </button>
        ))}
      />
      <ErrorBanner message={error} />
      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Invoice #</th>
              <th style={th}>Customer</th>
              <th style={th}>Type</th>
              <th style={th}>Amount</th>
              <th style={th}>Status</th>
              <th style={th}>Due</th>
              <th style={th}>Delivery</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv._id}>
                <td style={td}>{inv.invoiceNumber}</td>
                <td style={td}>{inv.customerId?.name || '—'}</td>
                <td style={td}>{inv.isRecurring ? 'Recurring' : 'One-time'}</td>
                <td style={td}>${inv.amount.toFixed(2)}</td>
                <td style={td}>{inv.status}</td>
                <td style={td}>{new Date(inv.dueDate).toLocaleDateString()}</td>
                <td style={td}>{inv.deliveryStatus}</td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td style={td} colSpan={7}>
                  No invoices yet — confirm a quotation from the Customer Portal to generate one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
