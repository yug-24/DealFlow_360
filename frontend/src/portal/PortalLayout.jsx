import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearSession, getProfile } from '../shared/api';

const TABS = [
  { to: '/portal/my-quotation', label: 'My Quotation' },
  { to: '/portal/messages', label: 'Messages' },
  { to: '/portal/profile', label: 'Profile' },
];

export default function PortalLayout() {
  const navigate = useNavigate();
  const profile = getProfile();

  function logout() {
    clearSession();
    navigate('/');
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 24px', borderBottom: '1px solid #e5e7eb', background: '#f8f9fa' }}>
        <div style={{ fontWeight: 700, padding: '14px 20px 14px 0', fontSize: 15 }}>DealFlow360</div>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            style={({ isActive }) => ({ padding: '14px 14px', textDecoration: 'none', fontSize: 14, color: isActive ? '#111827' : '#6b7280', background: isActive ? '#fff' : 'transparent', borderRadius: '6px 6px 0 0', fontWeight: isActive ? 600 : 400 })}
          >
            {tab.label}
          </NavLink>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12.5, color: '#374151' }}>{profile?.name} <span style={{ color: '#9ca3af' }}>· {profile?.tier}</span></span>
          <button onClick={logout} style={{ fontSize: 12, padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Log out</button>
        </div>
      </div>
      <Outlet />
    </div>
  );
}
