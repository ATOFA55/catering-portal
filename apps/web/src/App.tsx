import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import Audit from './pages/admin/Audit';
import Roles from './pages/admin/Roles';
import SettingsPage from './pages/admin/Settings';
import UsersPage from './pages/admin/Users';
import Catalog from './pages/Catalog';
import CatalogAdmin from './pages/CatalogAdmin';
import CustomerPortal from './pages/CustomerPortal';
import Dispatch from './pages/Dispatch';
import Driver from './pages/Driver';
import Events from './pages/Events';
import Executive from './pages/Executive';
import Finance, { MyInvoices } from './pages/Finance';
import Inventory from './pages/Inventory';
import Kitchen from './pages/Kitchen';
import Login, { ForgotPassword, ResetPassword } from './pages/Login';
import OrderBuilder from './pages/OrderBuilder';
import OrderDetail from './pages/OrderDetail';
import OrdersPage from './pages/Orders';

export default function App() {
  const { me, loading } = useAuth();
  if (loading) return <Loading />;
  if (!me) {
    return (
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  // Routes are not hidden by role on purpose: a page that is out of scope is refused by the API and shows "Access denied" (FR-34).
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={me.role.homePath} replace />} />
        <Route path="/login" element={<Navigate to={me.role.homePath} replace />} />
        <Route path="/portal" element={<CustomerPortal />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/order/new" element={<OrderBuilder />} />
        <Route path="/my-orders" element={<OrdersPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/invoices" element={<MyInvoices />} />
        <Route path="/kitchen" element={<Kitchen />} />
        <Route path="/dispatch" element={<Dispatch />} />
        <Route path="/driver" element={<Driver />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/events" element={<Events />} />
        <Route path="/executive" element={<Executive />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/catalog-admin" element={<CatalogAdmin />} />
        <Route path="/admin/users" element={<UsersPage />} />
        <Route path="/admin/roles" element={<Roles />} />
        <Route path="/admin/audit" element={<Audit />} />
        <Route path="/admin/settings" element={<SettingsPage />} />
        <Route path="*" element={<div className="card p-8 text-center text-ink-3">Page not found</div>} />
      </Route>
    </Routes>
  );
}
