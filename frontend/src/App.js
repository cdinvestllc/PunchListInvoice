import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import "@/App.css";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import DocForm from "@/components/DocForm";
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";
import VerifyEmail from "@/pages/auth/VerifyEmail";
import Dashboard from "@/pages/Dashboard";
import DocList from "@/pages/DocList";
import Requests from "@/pages/Requests";
import Upgrade from "@/pages/Upgrade";
import Settings from "@/pages/Settings";
import Profile from "@/pages/Profile";
import PublicProfile from "@/pages/PublicProfile";
import Admin from "@/pages/Admin";

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" data-testid="loading-spinner" />
    </div>
  );
}

function RequireAuth({ children, roles }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === null) return <Spinner />;
  if (user === false) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user } = useAuth();
  if (user === null) return <Spinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-right" richColors />
          <Routes>
            <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
            <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
            <Route path="/forgot-password" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/pro/:slug" element={<PublicProfile />} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/quotes" element={<RequireAuth roles={["pro"]}><DocList kind="quote" /></RequireAuth>} />
              <Route path="/quotes/new" element={<RequireAuth roles={["pro"]}><DocForm kind="quote" /></RequireAuth>} />
              <Route path="/quotes/:id" element={<RequireAuth roles={["pro"]}><DocForm kind="quote" /></RequireAuth>} />
              <Route path="/invoices" element={<RequireAuth roles={["pro"]}><DocList kind="invoice" /></RequireAuth>} />
              <Route path="/invoices/new" element={<RequireAuth roles={["pro"]}><DocForm kind="invoice" /></RequireAuth>} />
              <Route path="/invoices/:id" element={<RequireAuth roles={["pro"]}><DocForm kind="invoice" /></RequireAuth>} />
              <Route path="/requests" element={<RequireAuth roles={["pro"]}><Requests /></RequireAuth>} />
              <Route path="/upgrade" element={<RequireAuth roles={["pro"]}><Upgrade /></RequireAuth>} />
              <Route path="/settings" element={<RequireAuth roles={["pro"]}><Settings /></RequireAuth>} />
              <Route path="/profile" element={<RequireAuth roles={["pro"]}><Profile /></RequireAuth>} />
              <Route path="/admin" element={<RequireAuth roles={["admin"]}><Admin /></RequireAuth>} />
            </Route>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
