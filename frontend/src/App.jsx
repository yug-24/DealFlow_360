import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Login from './shared/Login';
import RequireAuth from './shared/RequireAuth';

import RepLayout from './rep/RepLayout';
import Dashboard from './rep/pages/Dashboard';
import Quotations from './rep/pages/Quotations';
import Approvals from './rep/pages/Approvals';
import Fulfillment from './rep/pages/Fulfillment';
import Subscriptions from './rep/pages/Subscriptions';
import Invoices from './rep/pages/Invoices';
import DealHealth from './rep/pages/DealHealth';
import Reports from './rep/pages/Reports';
import Products from './rep/pages/Products';

import PortalLayout from './portal/PortalLayout';
import MyQuotation from './portal/pages/MyQuotation';
import Messages from './portal/pages/Messages';
import Profile from './portal/pages/Profile';

const INTERNAL_ROLES = ['SalesRep', 'SalesManager', 'Finance', 'Admin'];

// Rep Workspace (/app/*) and Customer Portal (/portal/*) as separate route
// trees, per Architecture.md §2 and the wireframe's tab-based nav —
// gated by RequireAuth now that real JWT login (Phase 2/5) is wired up.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />

        <Route
          path="/app"
          element={
            <RequireAuth allow={INTERNAL_ROLES}>
              <RepLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="quotations" element={<Quotations />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="fulfillment" element={<Fulfillment />} />
          <Route path="subscriptions" element={<Subscriptions />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="deal-health" element={<DealHealth />} />
          <Route path="reports" element={<Reports />} />
          <Route path="products" element={<Products />} />
        </Route>

        <Route
          path="/portal"
          element={
            <RequireAuth allow={['Customer']}>
              <PortalLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="my-quotation" replace />} />
          <Route path="my-quotation" element={<MyQuotation />} />
          <Route path="messages" element={<Messages />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
