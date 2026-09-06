import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setSession } from './api';
import { Button, ErrorBanner } from './ui';

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('internal'); // 'internal' | 'portal'
  const [email, setEmail] = useState(mode === 'internal' ? 'rep@dealflow360.dev' : 'portal@acmecorp.dev');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function switchMode(next) {
    setMode(next);
    setEmail(next === 'internal' ? 'rep@dealflow360.dev' : 'portal@acmecorp.dev');
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'internal') {
        const { token, user } = await api.login(email, password);
        setSession(token, { id: user.id, name: user.name, role: user.role });
        navigate('/app/dashboard');
      } else {
        const { token, customer } = await api.portalLogin(email, password);
        setSession(token, { id: customer.id, name: customer.name, role: 'Customer', tier: customer.tier });
        navigate('/portal/my-quotation');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f8f9fa' }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 32, width: 380 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>DealFlow360</div>
        <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>Log In</h1>
        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0 }}>Continuous Deal Underwriting.</p>

        <div style={{ display: 'flex', gap: 4, marginTop: 16, background: '#f3f4f6', borderRadius: 8, padding: 3 }}>
          <button
            type="button"
            onClick={() => switchMode('internal')}
            style={tabStyle(mode === 'internal')}
          >
            Internal (Rep / Manager / Finance)
          </button>
          <button type="button" onClick={() => switchMode('portal')} style={tabStyle(mode === 'portal')}>
            Customer Portal
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 18 }}>
          <ErrorBanner message={error} />
          <label style={labelStyle}>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          <label style={labelStyle}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" disabled={loading} style={{ width: '100%', marginTop: 14, padding: '10px 12px' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>

      </div>
    </div>
  );
}

function tabStyle(active) {
  return {
    flex: 1,
    padding: '8px 10px',
    fontSize: 12,
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    background: active ? '#fff' : 'transparent',
    color: active ? '#111827' : '#6b7280',
    fontWeight: active ? 600 : 400,
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
  };
}

const labelStyle = { display: 'block', fontSize: 12, color: '#6b7280', marginTop: 10, marginBottom: 4 };
const inputStyle = {
  width: '100%',
  padding: '9px 10px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  fontSize: 13.5,
  boxSizing: 'border-box',
};
