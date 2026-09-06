import { Navigate } from 'react-router-dom';
import { getProfile } from './api';

/** Redirects to / if not logged in, or if logged in with the wrong role tree. */
export default function RequireAuth({ allow, children }) {
  const profile = getProfile();
  if (!profile) return <Navigate to="/" replace />;
  if (allow && !allow.includes(profile.role)) return <Navigate to="/" replace />;
  return children;
}
