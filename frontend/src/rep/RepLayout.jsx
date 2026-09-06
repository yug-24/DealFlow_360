import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearSession, getProfile } from '../shared/api';

const TABS = [
  { to: '/app/dashboard', label: 'Dashboard' },
  { to: '/app/quotations', label: 'Quotations' },
  { to: '/app/approvals', label: 'Approvals' },
  { to: '/app/fulfillment', label: 'Fulfillment' },
  { to: '/app/subscriptions', label: 'Subscriptions' },
  { to: '/app/invoices', label: 'Invoices' },
  { to: '/app/deal-health', label: 'Deal Health' },
  { to: '/app/reports', label: 'Reports' },
  { to: '/app/products', label: 'Products' },
];

export default function RepLayout() {
  const navigate = useNavigate();
  const profile = getProfile();

  function logout() {
    clearSession();
    navigate('/');
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 24px',
          borderBottom: '1px solid #e5e7eb',
          background: '#f8f9fa',
        }}
      >
        <div style={{ fontWeight: 700, padding: '14px 20px 14px 0', fontSize: 15 }}>DealFlow360</div>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            style={({ isActive }) => ({
              padding: '14px 14px',
              textDecoration: 'none',
              fontSize: 14,
              color: isActive ? '#111827' : '#6b7280',
              background: isActive ? '#fff' : 'transparent',
              borderRadius: '6px 6px 0 0',
              fontWeight: isActive ? 600 : 400,
            })}
          >
            {tab.label}
          </NavLink>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12.5, color: '#374151' }}>
            {profile?.name} <span style={{ color: '#9ca3af' }}>· {profile?.role}</span>
          </span>
          <button
            onClick={logout}
            style={{
              fontSize: 12,
              padding: '5px 10px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            Log out
          </button>
        </div>
      </div>
      <Outlet />
    </div>
  );
}
