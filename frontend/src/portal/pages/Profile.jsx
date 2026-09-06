import { useNavigate } from 'react-router-dom';
import { clearSession, getProfile } from '../../shared/api';
import { Button, Card, PageHeader } from '../../shared/ui';

export default function Profile() {
  const navigate = useNavigate();
  const profile = getProfile();

  function logout() {
    clearSession();
    navigate('/');
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 480 }}>
      <PageHeader title="Profile" />
      <Card>
        <Row label="Name" value={profile?.name} />
        <Row label="Account Tier" value={profile?.tier} />
        <Row label="Role" value="Customer (Portal)" />
        <Button variant="outline" style={{ marginTop: 14 }} onClick={logout}>
          Log out
        </Button>
      </Card>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13.5 }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value || '—'}</span>
    </div>
  );
}
