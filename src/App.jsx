import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import PublicLayout from './components/PublicLayout';
import { BrandMark } from './components/Brand';
import { Loading } from './components/ui';

import Landing from './pages/public/Landing';
import Apply from './pages/public/Apply';
import Status from './pages/public/Status';
import Privacy from './pages/public/Privacy';
import Login from './pages/auth/Login';
import Forgot from './pages/auth/Forgot';
import ResetPassword from './pages/auth/ResetPassword';

import Dashboard from './pages/Dashboard';
import Applications from './pages/admissions/Applications';
import ApplicationDetail from './pages/admissions/ApplicationDetail';
import Interviews from './pages/admissions/Interviews';
import InterviewDetail from './pages/admissions/InterviewDetail';
import Students from './pages/records/Students';
import StudentDetail from './pages/records/StudentDetail';
import Teachers from './pages/records/Teachers';
import Parents from './pages/records/Parents';
import Portal from './pages/portal/Portal';
import ChildDetail from './pages/portal/ChildDetail';
import Invoices from './pages/finance/Invoices';
import Payments from './pages/finance/Payments';
import Receipts from './pages/finance/Receipts';
import Arrears from './pages/finance/Arrears';
import Refunds from './pages/finance/Refunds';
import WriteOffs from './pages/finance/WriteOffs';
import Adjustments from './pages/finance/Adjustments';
import Ledger from './pages/finance/Ledger';
import Reports from './pages/Reports';
import Audit from './pages/Audit';
import Imports from './pages/Imports';
import Retention from './pages/Retention';
import Schools from './pages/Schools';
import Users from './pages/Users';
import Announcements from './pages/Announcements';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

function Splash() {
  return (
    <div className="splash">
      <BrandMark size={64} className="splash__mark" />
      <Loading />
    </div>
  );
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.isSuper) return children;
  if (!roles.includes(user.role)) return <Navigate to="/app" replace />;
  return children;
}

function SchoolRequired({ children }) {
  const { user } = useAuth();
  if (user?.isSuper && !user.activeSchool) return <Navigate to="/app/schools" replace />;
  return children;
}

const ADMIN = ['school_admin'];
const FINANCE = ['school_admin', 'bursar'];
const ADMISSIONS = ['school_admin', 'teacher'];
const RECORDS = ['school_admin', 'bursar'];
const SUPER = ['super_admin'];

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/apply" element={<Apply />} />
        <Route path="/status" element={<Status />} />
        <Route path="/privacy" element={<Privacy />} />
      </Route>

      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<Forgot />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />

        <Route path="applications" element={<RequireRole roles={ADMISSIONS}><Applications /></RequireRole>} />
        <Route path="applications/:id" element={<RequireRole roles={ADMISSIONS}><ApplicationDetail /></RequireRole>} />
        <Route path="interviews" element={<RequireRole roles={ADMISSIONS}><Interviews /></RequireRole>} />
        <Route path="interviews/:id" element={<RequireRole roles={ADMISSIONS}><InterviewDetail /></RequireRole>} />

        <Route path="students" element={<RequireRole roles={RECORDS}><SchoolRequired><Students /></SchoolRequired></RequireRole>} />
        <Route path="students/:id" element={<RequireRole roles={RECORDS}><SchoolRequired><StudentDetail /></SchoolRequired></RequireRole>} />
        <Route path="teachers" element={<RequireRole roles={ADMIN}><SchoolRequired><Teachers /></SchoolRequired></RequireRole>} />
        <Route path="parents" element={<RequireRole roles={ADMIN}><SchoolRequired><Parents /></SchoolRequired></RequireRole>} />

        <Route path="portal" element={<RequireRole roles={['parent']}><Portal /></RequireRole>} />
        <Route path="portal/:id" element={<RequireRole roles={['parent']}><ChildDetail /></RequireRole>} />

        <Route path="invoices" element={<RequireRole roles={FINANCE}><SchoolRequired><Invoices /></SchoolRequired></RequireRole>} />
        <Route path="payments" element={<RequireRole roles={FINANCE}><SchoolRequired><Payments /></SchoolRequired></RequireRole>} />
        <Route path="receipts" element={<RequireRole roles={FINANCE}><SchoolRequired><Receipts /></SchoolRequired></RequireRole>} />
        <Route path="arrears" element={<RequireRole roles={FINANCE}><SchoolRequired><Arrears /></SchoolRequired></RequireRole>} />
        <Route path="refunds" element={<RequireRole roles={FINANCE}><SchoolRequired><Refunds /></SchoolRequired></RequireRole>} />
        <Route path="write-offs" element={<RequireRole roles={FINANCE}><SchoolRequired><WriteOffs /></SchoolRequired></RequireRole>} />
        <Route path="adjustments" element={<RequireRole roles={FINANCE}><SchoolRequired><Adjustments /></SchoolRequired></RequireRole>} />
        <Route path="ledger" element={<RequireRole roles={FINANCE}><SchoolRequired><Ledger /></SchoolRequired></RequireRole>} />

        <Route path="reports" element={<RequireRole roles={FINANCE}><Reports /></RequireRole>} />
        <Route path="audit" element={<RequireRole roles={ADMIN}><Audit /></RequireRole>} />
        <Route path="imports" element={<RequireRole roles={ADMIN}><SchoolRequired><Imports /></SchoolRequired></RequireRole>} />
        <Route path="retention" element={<RequireRole roles={ADMIN}><SchoolRequired><Retention /></SchoolRequired></RequireRole>} />
        <Route path="users" element={<RequireRole roles={ADMIN}><Users /></RequireRole>} />

        <Route path="schools" element={<RequireRole roles={SUPER}><Schools /></RequireRole>} />
        <Route path="announcements" element={<RequireRole roles={SUPER}><Announcements /></RequireRole>} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />

        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="*" element={<NotFound standalone />} />
    </Routes>
  );
}
