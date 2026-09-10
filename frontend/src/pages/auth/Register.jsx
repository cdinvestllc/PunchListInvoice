import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errMsg } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { AuthShell, authInputCls, authLabelCls } from "./Login";

export default function Register() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", business_name: "", primary_trade: "", phone: "" });
  const [trades, setTrades] = useState([]);
  const [terms, setTerms] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/public/trades").then((r) => setTrades(r.data)).catch(() => {});
    api.get("/public/terms").then((r) => setTerms(r.data)).catch(() => {});
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!accepted) {
      setError("You must accept the Terms & Conditions to sign up.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", { ...form, terms_accepted: accepted, terms_version: terms?.version || "" });
      setUser(data);
      navigate("/dashboard");
    } catch (e2) {
      setError(errMsg(e2, "Registration failed."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Start quoting in minutes — free plan included." testid="register-page">
      <form onSubmit={submit} className="space-y-4" data-testid="register-form">
        {error && <div data-testid="register-error" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={authLabelCls} htmlFor="reg-name">Your Name *</label>
            <input id="reg-name" data-testid="register-name" required className={authInputCls} value={form.name}
              onChange={(e) => set("name", e.target.value)} placeholder="Alex Smith" />
          </div>
          <div>
            <label className={authLabelCls} htmlFor="reg-phone">Phone *</label>
            <input id="reg-phone" data-testid="register-phone" required className={authInputCls} value={form.phone}
              onChange={(e) => set("phone", e.target.value)} placeholder="(555) 000-0000" />
          </div>
        </div>
        <div>
          <label className={authLabelCls} htmlFor="reg-email">Email *</label>
          <input id="reg-email" data-testid="register-email" type="email" required className={authInputCls} value={form.email}
            onChange={(e) => set("email", e.target.value)} placeholder="you@business.com" />
        </div>
        <div>
          <label className={authLabelCls} htmlFor="reg-password">Password *</label>
          <input id="reg-password" data-testid="register-password" type="password" required minLength={8} className={authInputCls}
            value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Min 8 chars, letters + numbers" />
        </div>
        <div>
          <label className={authLabelCls} htmlFor="reg-business">Business Name *</label>
          <input id="reg-business" data-testid="register-business-name" required className={authInputCls} value={form.business_name}
            onChange={(e) => set("business_name", e.target.value)} placeholder="Smith Services LLC" />
        </div>
        <div>
          <label className={authLabelCls} htmlFor="reg-trade">Primary Trade *</label>
          <select id="reg-trade" data-testid="register-primary-trade" required className={authInputCls} value={form.primary_trade}
            onChange={(e) => set("primary_trade", e.target.value)}>
            <option value="">Select a trade…</option>
            {trades.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </div>
        <label className="flex items-start gap-2.5 cursor-pointer" data-testid="register-terms-label">
          <input type="checkbox" data-testid="register-terms-checkbox" checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-xs text-slate-600">
            I agree to the{" "}
            <button type="button" data-testid="btn-view-terms" onClick={() => setShowTerms(!showTerms)}
              className="text-blue-600 font-semibold hover:underline">
              Terms & Conditions
            </button>{" "}
            {terms && `(v${terms.version})`}
          </span>
        </label>
        {showTerms && terms && (
          <pre data-testid="terms-content" className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap">
            {terms.content}
          </pre>
        )}
        <button type="submit" data-testid="register-submit-button" disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors">
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="text-sm text-center mt-4 text-slate-500">
        Already have an account?{" "}
        <Link to="/login" data-testid="link-login" className="text-blue-600 hover:text-blue-800 font-medium">Log in</Link>
      </p>
    </AuthShell>
  );
}
