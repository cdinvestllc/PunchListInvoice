import { useEffect, useRef, useState } from "react";
import { NavLink, Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/api";
import {
  LayoutDashboard, FileText, ReceiptText, Inbox, UserCircle2, Rocket,
  Settings as SettingsIcon, ShieldCheck, Menu, X, LogOut, Bell, Download, Zap,
} from "lucide-react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["pro", "admin", "customer"] },
  { to: "/quotes", label: "Quotes", icon: FileText, roles: ["pro"] },
  { to: "/invoices", label: "Invoices", icon: ReceiptText, roles: ["pro"] },
  { to: "/requests", label: "Requests", icon: Inbox, roles: ["pro"] },
  { to: "/profile", label: "Profile", icon: UserCircle2, roles: ["pro"] },
  { to: "/upgrade", label: "Upgrade", icon: Rocket, roles: ["pro"] },
  { to: "/settings", label: "Settings", icon: SettingsIcon, roles: ["pro"] },
  { to: "/admin", label: "Admin", icon: ShieldCheck, roles: ["admin"] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [installEvt, setInstallEvt] = useState(null);
  const [notifs, setNotifs] = useState(null);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef(null);

  useEffect(() => {
    const h = (e) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  useEffect(() => {
    if (user) api.get("/notifications").then((r) => setNotifs(r.data)).catch(() => {});
  }, [user]);

  useEffect(() => {
    const close = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!user) return null;
  const isPro = user.role === "pro";
  const isPaid = user.subscription?.plan === "pro" && ["active", "canceled"].includes(user.subscription?.status);
  const usage = user.usage || { quotes_sent: 0, invoices_sent: 0 };
  const limits = user.limits || {};

  const doLogout = async () => { await logout(); navigate("/login"); };
  const openNotifs = async () => {
    setShowNotifs(!showNotifs);
    if (!showNotifs && notifs?.unread > 0) {
      await api.post("/notifications/read-all").catch(() => {});
      setNotifs({ ...notifs, unread: 0 });
    }
  };

  const nav = NAV.filter((n) => n.roles.includes(user.role));
  const linkCls = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
      isActive ? "bg-blue-600 text-white font-medium shadow-sm" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`;

  const sidebar = (
    <div className="flex flex-col h-full bg-slate-900 w-64">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-bold text-lg tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>Quote Flow</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1" data-testid="sidebar-nav">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} data-testid={`sidebar-link-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
            className={linkCls} onClick={() => setDrawer(false)}>
            <n.icon className="w-4 h-4" /> {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-semibold">
            {user.name?.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium truncate" data-testid="sidebar-user-name">{user.name}</p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Online
          </span>
          <button data-testid="btn-logout" onClick={doLogout}
            className="text-xs text-slate-300 hover:text-white flex items-center gap-1 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Log out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex" data-testid="app-layout">
      <aside className="hidden lg:block fixed inset-y-0 left-0 z-30">{sidebar}</aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 z-50">{sidebar}</div>
        </div>
      )}

      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 h-14 flex items-center px-4 gap-3">
          <button data-testid="btn-mobile-menu" className="lg:hidden text-slate-600" onClick={() => setDrawer(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          {installEvt && (
            <button data-testid="btn-install-app"
              onClick={async () => { installEvt.prompt(); setInstallEvt(null); }}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-md hover:bg-blue-100 transition-colors">
              <Download className="w-3.5 h-3.5" /> Install App
            </button>
          )}
          <div className="relative" ref={notifRef}>
            <button data-testid="btn-notifications" onClick={openNotifs}
              className="relative p-2 text-slate-500 hover:text-slate-800 transition-colors">
              <Bell className="w-5 h-5" />
              {notifs?.unread > 0 && (
                <span data-testid="notification-count"
                  className="absolute -top-0.5 -right-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-full w-4.5 h-4.5 min-w-[18px] px-1 flex items-center justify-center">
                  {notifs.unread}
                </span>
              )}
            </button>
            {showNotifs && (
              <div data-testid="notifications-dropdown"
                className="absolute right-0 mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-lg max-h-96 overflow-y-auto">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-4 py-3 border-b border-slate-100">Notifications</p>
                {(!notifs?.items || notifs.items.length === 0) && (
                  <p className="text-sm text-slate-500 px-4 py-6 text-center">No notifications yet.</p>
                )}
                {notifs?.items?.map((n) => (
                  <Link key={n.id} to={n.link || "#"} onClick={() => setShowNotifs(false)}
                    className="block px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <p className="text-sm font-medium text-slate-900">{n.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </header>

        {isPro && !isPaid && (
          <div data-testid="banner-upgrade-cta" className="bg-blue-50 border-b border-blue-100 px-4 py-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <p className="text-xs sm:text-sm font-medium text-blue-900">
              You're on Free Mode — {usage.quotes_sent}/{limits.quote_limit ?? 3} quotes & {usage.invoices_sent}/{limits.invoice_limit ?? 3} invoices sent this month.
            </p>
            <Link to="/upgrade" data-testid="banner-upgrade-btn"
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1 rounded-md shadow-sm transition-colors">
              Upgrade
            </Link>
          </div>
        )}
        {!user.email_verified && (
          <div data-testid="banner-verify-email" className="bg-amber-50 border-b border-amber-100 px-4 py-2 text-center text-xs sm:text-sm text-amber-900">
            Please verify your email — check the notifications bell for your verification link (emails are mocked in this demo).
          </div>
        )}
        {user.is_demo && (
          <div data-testid="banner-demo-account" className="bg-slate-800 px-4 py-1.5 text-center text-[11px] text-slate-300">
            Demo account — fictional data, development use only. Change this password before any real use.
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto">
          <Outlet context={{ refreshNotifs: () => api.get("/notifications").then((r) => setNotifs(r.data)).catch(() => {}) }} />
        </main>
        <footer className="px-6 py-4 text-center text-xs text-slate-400">
          Questions? {user.settings?.support_phone || "(515) 717-3277"} · Quote Flow
        </footer>
      </div>
    </div>
  );
}
