import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { errMsg } from "@/api";
import { Zap } from "lucide-react";

export const authInputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow";
export const authLabelCls = "block text-xs font-semibold text-slate-600 mb-1.5";

export function AuthShell({ title, subtitle, children, testid }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4" data-testid={testid}>
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-2xl tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
            Quote Flow
          </span>
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-1 mb-6">{subtitle}</p>}
          {children}
        </div>
        <p className="text-center text-xs text-slate-500 mt-6">Fast quotes for every trade.</p>
      </div>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (e2) {
      setError(errMsg(e2, "Login failed."));
    } finally {
      setLoading(false);
    }
  };

  const demo = [
    ["Admin", "cdinvestllc@gmail.com", "ChangeMe!Admin2026"],
    ["Pro (Free)", "pro.free@example.test", "ChangeMe!Free2026"],
    ["Pro (Paid)", "pro.paid@example.test", "ChangeMe!Paid2026"],
    ["Customer", "customer.demo@example.test", "ChangeMe!Customer2026"],
  ];

  return (
    <AuthShell title="Welcome back" subtitle="Log in to your Quote Flow account." testid="login-page">
      <form onSubmit={submit} className="space-y-4" data-testid="login-form">
        {error && <div data-testid="login-error" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className={authLabelCls} htmlFor="login-email">Email</label>
          <input id="login-email" data-testid="login-email" type="email" required className={authInputCls}
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
        </div>
        <div>
          <label className={authLabelCls} htmlFor="login-password">Password</label>
          <input id="login-password" data-testid="login-password" type="password" required className={authInputCls}
            value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <button type="submit" data-testid="login-form-submit-button" disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors">
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>
      <div className="flex items-center justify-between mt-4 text-sm">
        <Link to="/forgot-password" data-testid="link-forgot-password" className="text-blue-600 hover:text-blue-800 font-medium">Forgot password?</Link>
        <Link to="/register" data-testid="link-register" className="text-blue-600 hover:text-blue-800 font-medium">Create account</Link>
      </div>
      <div className="mt-6 border-t border-slate-100 pt-4">
        <button data-testid="btn-toggle-demo-accounts" onClick={() => setShowDemo(!showDemo)}
          className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors">
          {showDemo ? "Hide" : "Show"} demo accounts
        </button>
        {showDemo && (
          <div className="mt-3 space-y-1.5" data-testid="demo-accounts-list">
            {demo.map(([label, e, p]) => (
              <button key={e} type="button" onClick={() => { setEmail(e); setPassword(p); }}
                data-testid={`demo-account-${label.toLowerCase().replace(/[^a-z]/g, "-")}`}
                className="w-full text-left text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 transition-colors">
                <span className="font-semibold text-slate-700">{label}:</span>{" "}
                <span className="text-slate-500">{e}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </AuthShell>
  );
}
