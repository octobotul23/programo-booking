import { Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { homeFor, useAuth } from './lib/auth.jsx';
import { useI18n } from './lib/i18n.jsx';
import { lazyPage } from './lib/lazyPage.js';
import { PageLoader } from './components/ui.jsx';
import Landing from './pages/Landing.jsx';
import { Login, Register } from './pages/Auth.jsx';

// everything past the front door is fetched the first time it is opened
const Onboarding = lazyPage(() => import('./pages/Onboarding.jsx'));
const BusinessLayout = lazyPage(() => import('./pages/business/Layout.jsx'));
const CalendarPage = lazyPage(() => import('./pages/business/CalendarPage.jsx'));
const AppointmentsPage = lazyPage(() => import('./pages/business/AppointmentsPage.jsx'));
const DashboardPage = lazyPage(() => import('./pages/business/DashboardPage.jsx'));
const PatientsPage = lazyPage(() => import('./pages/business/PatientsPage.jsx'));
const PatientPage = lazyPage(() => import('./pages/business/PatientPage.jsx'));
const CashierPage = lazyPage(() => import('./pages/business/CashierPage.jsx'));
const CompaniesPage = lazyPage(() => import('./pages/business/CompaniesPage.jsx'));
const ReportsPage = lazyPage(() => import('./pages/business/ReportsPage.jsx'));
const NotificationsPage = lazyPage(() => import('./pages/business/NotificationsPage.jsx'));
const MessagesPage = lazyPage(() => import('./pages/business/MessagesPage.jsx'));
const SearchPage = lazyPage(() => import('./pages/business/SearchPage.jsx'));
const SupportPage = lazyPage(() => import('./pages/business/SupportPage.jsx'));
const AccountPage = lazyPage(() => import('./pages/business/AccountPage.jsx'));
const SettingsPage = lazyPage(() => import('./pages/business/SettingsPage.jsx'));
const ClientHome = lazyPage(() => import('./pages/client/ClientHome.jsx'));
const BookingPage = lazyPage(() => import('./pages/public/BookingPage.jsx'));
const JoinPage = lazyPage(() => import('./pages/JoinPage.jsx'));
const ResetPage = lazyPage(() => import('./pages/ResetPage.jsx'));

/** Gate a route by account type(s); sends visitors to log in and back. */
function Guard({ role, children }) {
  const { loading, user, businesses } = useAuth();
  const loc = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (role && ![role].flat().includes(user.role)) return <Navigate to={homeFor(user, businesses)} replace />;
  return children;
}

export default function App() {
  const { lang } = useI18n();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/b/:slug" element={<BookingPage />} />
        <Route path="/join/:token" element={<JoinPage />} />
        <Route path="/reset/:token" element={<ResetPage />} />
        <Route
          path="/onboarding"
          element={
            <Guard role="business">
              <Onboarding />
            </Guard>
          }
        />
        <Route
          path="/app/:bid"
          element={
            <Guard role={['business', 'staff']}>
              <BusinessLayout />
            </Guard>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="appointments" element={<AppointmentsPage />} />
          <Route path="patients" element={<PatientsPage />} />
          <Route path="patients/:pid" element={<PatientPage />} />
          <Route path="clients" element={<Navigate to="../patients" relative="path" replace />} />
          <Route path="cashier" element={<CashierPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="companies" element={<CompaniesPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="settings" element={<Navigate to="general" replace />} />
          <Route path="settings/:tab" element={<SettingsPage />} />
        </Route>
        <Route path="/app" element={<AppRedirect />} />
        <Route
          path="/me"
          element={
            <Guard role="client">
              <ClientHome />
            </Guard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function AppRedirect() {
  const { loading, user, businesses } = useAuth();
  if (loading) return <PageLoader />;
  return <Navigate to={homeFor(user, businesses)} replace />;
}
