import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, errMsg, fmtDate, imgUrl } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/components/ui/sonner";
import { Upload, Trash2, Lock, Rocket } from "lucide-react";

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow";
const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5";

export default function Settings() {
  const { user, refresh } = useAuth();
  const [trades, setTrades] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const isPaid = user?.subscription?.plan === "pro" && ["active", "canceled"].includes(user?.subscription?.status);

  useEffect(() => {
    api.get("/public/trades").then((r) => setTrades(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.professional) {
      const p = user.professional;
      setForm({
        name: user.name, business_name: p.business_name || "", primary_trade: p.primary_trade || "",
        address: p.address || "", phone: p.phone || "", email: p.email || user.email,
        license: p.license || "", default_tax_rate: p.default_tax_rate ?? 0, default_labor_rate: p.default_labor_rate ?? 0,
      });
    }
  }, [user]);

  if (!form) return <div className="py-20 text-center text-slate-400 text-sm">Loading…</div>;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/settings/business", {
        ...form,
        default_tax_rate: parseFloat(form.default_tax_rate) || 0,
        default_labor_rate: parseFloat(form.default_labor_rate) || 0,
      });
      toast.success("Business settings saved.");
      await refresh();
    } catch (e2) { toast.error(errMsg(e2)); } finally { setSaving(false); }
  };

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api.post("/settings/logo", fd);
      toast.success("Logo uploaded.");
      await refresh();
    } catch (e2) { toast.error(errMsg(e2)); }
    e.target.value = "";
  };

  const removeLogo = async () => {
    try {
      await api.delete("/settings/logo");
      toast.success("Logo removed.");
      await refresh();
    } catch (e2) { toast.error(errMsg(e2)); }
  };

  return (
    <div data-testid="settings-page" className="max-w-3xl">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>Settings</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">Customize your business profile and defaults</p>

      {!isPaid && (
        <div data-testid="free-mode-banner" className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <p className="text-amber-900 text-sm">
            You're using Free Mode. Upgrade to Full Mode to unlock unlimited estimates and invoices, professional branding, and remove the platform watermark.
          </p>
          <Link to="/upgrade" data-testid="free-mode-upgrade-btn"
            className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-md transition-colors">
            <Rocket className="w-3.5 h-3.5" /> Upgrade
          </Link>
        </div>
      )}

      <form onSubmit={save} className="space-y-6">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Business Profile</h2>
          <p className="text-xs text-slate-400 mb-4">This info appears on your quotes and invoices</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="set-name">Your Name *</label>
              <input id="set-name" data-testid="settings-name" className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="set-business">Business Name *</label>
              <input id="set-business" data-testid="settings-business-name" className={inputCls} value={form.business_name} onChange={(e) => set("business_name", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="set-trade">Primary Trade</label>
              <select id="set-trade" data-testid="settings-primary-trade" className={inputCls} value={form.primary_trade} onChange={(e) => set("primary_trade", e.target.value)}>
                {trades.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">Controls the trade shown on your profile and PDFs.</p>
            </div>
            <div>
              <label className={labelCls} htmlFor="set-phone">Phone *</label>
              <input id="set-phone" data-testid="settings-phone" className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="set-email">Business Email *</label>
              <input id="set-email" data-testid="settings-email" type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="set-license">License #</label>
              <input id="set-license" data-testid="settings-license" className={inputCls} value={form.license} onChange={(e) => set("license", e.target.value)} placeholder="License or registration number" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="set-address">Business Address</label>
              <input id="set-address" data-testid="settings-address" className={inputCls} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St, City, State 00000" />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6" data-testid="logo-section">
          <h2 className="text-lg font-semibold text-slate-900">Business Logo</h2>
          <p className="text-xs text-slate-400 mb-4">PNG or JPG, max {user.settings?.image_max_mb ?? 5} MB. Appears on your PDFs.</p>
          {!isPaid ? (
            <div className="flex items-center gap-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl p-5" data-testid="logo-locked">
              <Lock className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-700">Logo branding is a Full Mode feature</p>
                <Link to="/upgrade" className="text-xs text-blue-600 font-semibold hover:underline" data-testid="logo-upgrade-link">Upgrade to unlock</Link>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden" data-testid="logo-preview">
                {user.professional?.logo_path
                  ? <img src={imgUrl(user.professional.logo_path)} alt="Business logo" className="object-contain w-full h-full" />
                  : <span className="text-xs text-slate-400">No logo</span>}
              </div>
              <div className="space-y-2">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                  data-testid="input-logo-file" onChange={uploadLogo} />
                <button type="button" data-testid="btn-upload-logo" onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors">
                  <Upload className="w-4 h-4" /> Upload Logo
                </button>
                {user.professional?.logo_path && (
                  <button type="button" data-testid="btn-remove-logo" onClick={removeLogo}
                    className="flex items-center gap-1.5 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg hover:bg-red-100 transition-colors">
                    <Trash2 className="w-4 h-4" /> Remove
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Quote & Invoice Defaults</h2>
          <p className="text-xs text-slate-400 mb-4">Pre-filled values when creating new quotes and invoices</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="set-tax">Default Tax Rate (%)</label>
              <input id="set-tax" data-testid="settings-tax-rate" type="number" min="0" max="100" step="any" className={inputCls}
                value={form.default_tax_rate} onChange={(e) => set("default_tax_rate", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="set-labor">Default Labor Rate ($/hr)</label>
              <input id="set-labor" data-testid="settings-labor-rate" type="number" min="0" step="any" className={inputCls}
                value={form.default_labor_rate} onChange={(e) => set("default_labor_rate", e.target.value)} />
            </div>
          </div>
        </section>

        <button type="submit" data-testid="btn-save-settings" disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg shadow-sm disabled:opacity-50 transition-colors">
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </form>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6 mt-6" data-testid="subscription-status-card">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Subscription</h2>
        <p className="text-sm text-slate-600">
          Current plan: <strong className="capitalize" data-testid="current-plan">{isPaid ? "Full Mode (Pro)" : "Free Mode"}</strong>
          {isPaid && user.subscription?.current_period_end && (
            <span className="text-slate-400"> · renews/ends {fmtDate(user.subscription.current_period_end)}</span>
          )}
        </p>
        <Link to="/upgrade" data-testid="settings-manage-subscription"
          className="inline-block mt-3 text-sm font-semibold text-blue-600 hover:underline">
          {isPaid ? "Manage subscription" : "Upgrade to Full Mode"}
        </Link>
      </section>
    </div>
  );
}
