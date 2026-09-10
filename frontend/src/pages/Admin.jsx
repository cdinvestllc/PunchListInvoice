import { useCallback, useEffect, useRef, useState } from "react";
import { api, errMsg, fmt, fmtDate, imgUrl } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/components/ui/sonner";
import StatusBadge from "@/components/StatusBadge";
import { ChevronUp, ChevronDown, Trash2, Plus, Upload } from "lucide-react";

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow";
const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5";
const TABS = ["Overview", "Users", "Trades", "Coupons", "Watermark", "Platform", "Audit Logs", "Documents"];

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState("Overview");
  return (
    <div data-testid="admin-page">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>Admin Console</h1>
      <p className="text-sm text-slate-500 mb-5">Platform management — full control</p>
      <div className="flex flex-wrap gap-2 mb-6" data-testid="admin-tabs">
        {TABS.map((t) => (
          <button key={t} data-testid={`admin-tab-${t.toLowerCase().replace(/\s+/g, "-")}`} onClick={() => setTab(t)}
            className={`text-xs font-semibold px-3.5 py-2 rounded-lg border transition-colors ${tab === t ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Overview" && <Overview />}
      {tab === "Users" && <Users me={user} />}
      {tab === "Trades" && <Trades />}
      {tab === "Coupons" && <Coupons />}
      {tab === "Watermark" && <Watermark />}
      {tab === "Platform" && <Platform />}
      {tab === "Audit Logs" && <AuditLogs />}
      {tab === "Documents" && <Documents />}
    </div>
  );
}

function Card({ title, children, testid }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6" data-testid={testid}>
      {title && <h2 className="text-lg font-semibold text-slate-900 mb-4">{title}</h2>}
      {children}
    </section>
  );
}

function Overview() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/admin/overview").then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e))); }, []);
  const cards = [
    ["Total Users", d?.users], ["Pros", d?.pros], ["Customers", d?.customers],
    ["Quotes", d?.quotes], ["Invoices", d?.invoices], ["Estimate Requests", d?.requests],
    ["Paid Subscriptions", d?.paid_subscriptions], ["MRR", d ? fmt(d.mrr) : "—"],
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="admin-overview">
      {cards.map(([label, v]) => (
        <div key={label} data-testid={`admin-metric-${label.toLowerCase().replace(/\s+/g, "-")}`} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="text-2xl font-bold mt-2 text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>{v ?? "—"}</p>
        </div>
      ))}
    </div>
  );
}

function Users({ me }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const load = useCallback(() => {
    api.get(`/admin/users?page=${page}&limit=15${q ? `&q=${encodeURIComponent(q)}` : ""}`)
      .then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e)));
  }, [page, q]);
  useEffect(() => { load(); }, [load]);

  const update = async (id, payload, msg = "User updated.") => {
    try { await api.put(`/admin/users/${id}`, payload); toast.success(msg); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async (u) => {
    if (!window.confirm(`Delete ${u.email}? (soft delete — records retained)`)) return;
    try { await api.delete(`/admin/users/${u.id}`); toast.success("User deleted."); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <Card testid="admin-users-card">
      <input data-testid="admin-user-search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
        placeholder="Search name or email…" className={`${inputCls} max-w-xs mb-4`} />
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full" data-testid="admin-users-table">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="py-3 px-4 text-left">User</th><th className="py-3 px-4 text-left">Role</th>
              <th className="py-3 px-4 text-left">Plan</th><th className="py-3 px-4 text-left">Status</th>
              <th className="py-3 px-4 text-left hidden md:table-cell">Usage (Q/I sent)</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.items?.map((u) => (
              <tr key={u.id} data-testid={`admin-user-row-${u.id}`} className="border-b border-slate-100 text-sm text-slate-700">
                <td className="py-3 px-4">
                  <p className="font-medium text-slate-900">{u.name}{u.is_demo && <span className="ml-1.5 text-[10px] font-bold text-amber-600 uppercase">demo</span>}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                  {u.professional && <p className="text-xs text-slate-400">{u.professional.business_name} · {u.professional.primary_trade}</p>}
                </td>
                <td className="py-3 px-4"><StatusBadge status={u.role} testid={`admin-user-role-${u.id}`} /></td>
                <td className="py-3 px-4"><StatusBadge status={u.subscription?.plan || "free"} testid={`admin-user-plan-${u.id}`} /></td>
                <td className="py-3 px-4"><StatusBadge status={u.status} testid={`admin-user-status-${u.id}`} /></td>
                <td className="py-3 px-4 hidden md:table-cell text-slate-500">{u.usage?.quotes_sent ?? 0} / {u.usage?.invoices_sent ?? 0}</td>
                <td className="py-3 px-4">
                  {u.email !== me?.email && (
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {u.status === "active"
                        ? <button data-testid={`btn-suspend-${u.id}`} onClick={() => update(u.id, { status: "suspended" }, "User suspended.")}
                            className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md hover:bg-amber-100">Suspend</button>
                        : <button data-testid={`btn-activate-${u.id}`} onClick={() => update(u.id, { status: "active" }, "User activated.")}
                            className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md hover:bg-emerald-100">Activate</button>}
                      {u.role === "pro" && (u.subscription?.plan === "pro"
                        ? <button data-testid={`btn-make-free-${u.id}`} onClick={() => update(u.id, { plan: "free" }, "Moved to Free Mode.")}
                            className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md hover:bg-slate-100">Set Free</button>
                        : <button data-testid={`btn-make-pro-${u.id}`} onClick={() => update(u.id, { plan: "pro" }, "Upgraded to Full Mode.")}
                            className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded-md hover:bg-blue-100">Set Pro</button>)}
                      <button data-testid={`btn-delete-user-${u.id}`} onClick={() => remove(u)}
                        className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-center gap-3 mt-4">
        <button data-testid="btn-users-prev" disabled={page <= 1} onClick={() => setPage(page - 1)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40">Prev</button>
        <span className="text-xs text-slate-500">Page {page} of {pages}</span>
        <button data-testid="btn-users-next" disabled={page >= pages} onClick={() => setPage(page + 1)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40">Next</button>
      </div>
    </Card>
  );
}

function Trades() {
  const [trades, setTrades] = useState([]);
  const [name, setName] = useState("");
  const load = useCallback(() => api.get("/admin/trades").then((r) => setTrades(r.data)).catch((e) => toast.error(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    try { await api.post("/admin/trades", { name, active: true }); setName(""); toast.success("Trade added."); load(); }
    catch (e2) { toast.error(errMsg(e2)); }
  };
  const toggle = async (t) => {
    try { await api.put(`/admin/trades/${t.id}`, { name: t.name, active: !t.active }); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const rename = async (t) => {
    const n = window.prompt("Trade name:", t.name);
    if (!n || n === t.name) return;
    try { await api.put(`/admin/trades/${t.id}`, { name: n, active: t.active }); toast.success("Trade updated."); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async (t) => {
    if (!window.confirm(`Delete trade "${t.name}"?`)) return;
    try { await api.delete(`/admin/trades/${t.id}`); toast.success("Trade deleted."); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const move = async (i, dir) => {
    const next = [...trades];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setTrades(next);
    await api.post("/admin/trades/reorder", { order: next.map((t) => t.id) }).catch((e) => toast.error(errMsg(e)));
  };

  return (
    <Card title="Trades" testid="admin-trades-card">
      <form onSubmit={add} className="flex gap-2 mb-4">
        <input data-testid="admin-trade-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="New trade name…" className={`${inputCls} max-w-xs`} required minLength={2} />
        <button data-testid="btn-add-trade" className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Add
        </button>
      </form>
      <ul className="divide-y divide-slate-100" data-testid="admin-trades-list">
        {trades.map((t, i) => (
          <li key={t.id} data-testid={`admin-trade-${t.id}`} className="flex items-center gap-2 py-2.5">
            <span className="text-xs text-slate-400 w-6">{i + 1}.</span>
            <span className={`flex-1 text-sm font-medium ${t.active ? "text-slate-900" : "text-slate-400 line-through"}`}>{t.name}</span>
            <StatusBadge status={t.active ? "active" : "suspended"} testid={`trade-status-${t.id}`} />
            <button title="Rename" data-testid={`trade-rename-${t.id}`} onClick={() => rename(t)} className="text-xs font-semibold text-blue-700 px-2 py-1 hover:underline">Edit</button>
            <button title="Toggle" data-testid={`trade-toggle-${t.id}`} onClick={() => toggle(t)} className="text-xs font-semibold text-slate-600 px-2 py-1 hover:underline">
              {t.active ? "Disable" : "Enable"}</button>
            <button title="Move up" data-testid={`trade-up-${t.id}`} onClick={() => move(i, -1)} className="p-1 text-slate-400 hover:text-slate-800"><ChevronUp className="w-4 h-4" /></button>
            <button title="Move down" data-testid={`trade-down-${t.id}`} onClick={() => move(i, 1)} className="p-1 text-slate-400 hover:text-slate-800"><ChevronDown className="w-4 h-4" /></button>
            <button title="Delete" data-testid={`trade-delete-${t.id}`} onClick={() => remove(t)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Coupons() {
  const [coupons, setCoupons] = useState([]);
  const [form, setForm] = useState({ code: "", type: "percent", value: 10, start_date: "", end_date: "", max_redemptions: 100, active: true });
  const load = useCallback(() => api.get("/admin/coupons").then((r) => setCoupons(r.data)).catch((e) => toast.error(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post("/admin/coupons", { ...form, value: parseFloat(form.value), max_redemptions: parseInt(form.max_redemptions) || 100,
        start_date: form.start_date || null, end_date: form.end_date || null });
      toast.success("Coupon created.");
      setForm({ code: "", type: "percent", value: 10, start_date: "", end_date: "", max_redemptions: 100, active: true });
      load();
    } catch (e2) { toast.error(errMsg(e2)); }
  };
  const toggle = async (c) => {
    try { await api.put(`/admin/coupons/${c.id}`, { code: c.code, type: c.type, value: c.value, start_date: c.start_date, end_date: c.end_date, max_redemptions: c.max_redemptions, active: !c.active }); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async (c) => {
    if (!window.confirm(`Delete coupon ${c.code}?`)) return;
    try { await api.delete(`/admin/coupons/${c.id}`); load(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <Card title="Coupons" testid="admin-coupons-card">
      <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-5 items-end">
        <div className="col-span-2 sm:col-span-1"><label className={labelCls}>Code</label>
          <input data-testid="coupon-code" required className={inputCls} value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="SAVE20" /></div>
        <div><label className={labelCls}>Type</label>
          <select data-testid="coupon-type" className={inputCls} value={form.type} onChange={(e) => set("type", e.target.value)}>
            <option value="percent">Percent %</option><option value="fixed">Fixed $</option></select></div>
        <div><label className={labelCls}>Value</label>
          <input data-testid="coupon-value" required type="number" min="0.01" step="any" className={inputCls} value={form.value} onChange={(e) => set("value", e.target.value)} /></div>
        <div><label className={labelCls}>Start</label>
          <input data-testid="coupon-start" type="date" className={inputCls} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></div>
        <div><label className={labelCls}>End</label>
          <input data-testid="coupon-end" type="date" className={inputCls} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></div>
        <div><label className={labelCls}>Max uses</label>
          <input data-testid="coupon-max" type="number" min="1" className={inputCls} value={form.max_redemptions} onChange={(e) => set("max_redemptions", e.target.value)} /></div>
        <button data-testid="btn-create-coupon" className="col-span-2 sm:col-span-6 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors w-fit">
          Create Coupon
        </button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full" data-testid="admin-coupons-table">
          <thead><tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <th className="py-3 px-4 text-left">Code</th><th className="py-3 px-4 text-left">Discount</th>
            <th className="py-3 px-4 text-left hidden sm:table-cell">Window</th><th className="py-3 px-4 text-left">Uses</th>
            <th className="py-3 px-4 text-left">Status</th><th className="py-3 px-4 text-right">Actions</th></tr></thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} data-testid={`coupon-row-${c.id}`} className="border-b border-slate-100 text-sm text-slate-700">
                <td className="py-3 px-4 font-mono font-semibold text-slate-900">{c.code}</td>
                <td className="py-3 px-4">{c.type === "percent" ? `${c.value}%` : fmt(c.value)}</td>
                <td className="py-3 px-4 hidden sm:table-cell text-slate-500 text-xs">{c.start_date || "—"} → {c.end_date || "—"}</td>
                <td className="py-3 px-4">{c.redemptions}/{c.max_redemptions}</td>
                <td className="py-3 px-4"><StatusBadge status={c.active ? "active" : "suspended"} testid={`coupon-status-${c.id}`} /></td>
                <td className="py-3 px-4 text-right">
                  <button data-testid={`coupon-toggle-${c.id}`} onClick={() => toggle(c)} className="text-xs font-semibold text-blue-700 px-2 py-1 hover:underline">
                    {c.active ? "Disable" : "Enable"}</button>
                  <button data-testid={`coupon-delete-${c.id}`} onClick={() => remove(c)} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Watermark() {
  const [wm, setWm] = useState(null);
  const fileRef = useRef(null);
  const load = useCallback(() => api.get("/admin/watermark").then((r) => setWm(r.data)).catch((e) => toast.error(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);
  if (!wm) return null;
  const set = (k, v) => setWm((w) => ({ ...w, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put("/admin/watermark", { enabled: wm.enabled, text: wm.text, size: parseInt(wm.size) || 44,
        opacity: parseFloat(wm.opacity) || 0.12, position: wm.position });
      toast.success("Watermark settings saved.");
    } catch (e2) { toast.error(errMsg(e2)); }
  };
  const uploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try { await api.post("/admin/watermark/image", fd); toast.success("Watermark image uploaded."); load(); }
    catch (e2) { toast.error(errMsg(e2)); }
    e.target.value = "";
  };

  return (
    <Card title="Platform Watermark" testid="admin-watermark-card">
      <p className="text-xs text-slate-400 mb-4">Applied to PDFs generated by Free Mode pros. Paid pros never receive the watermark.</p>
      <form onSubmit={save} className="space-y-4 max-w-md">
        <label className="flex items-center gap-3">
          <input type="checkbox" data-testid="watermark-enabled" checked={wm.enabled} onChange={(e) => set("enabled", e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-sm font-medium text-slate-700">Watermark enabled</span>
        </label>
        <div><label className={labelCls}>Text</label>
          <input data-testid="watermark-text" className={inputCls} value={wm.text || ""} onChange={(e) => set("text", e.target.value)} maxLength={120} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={labelCls}>Size</label>
            <input data-testid="watermark-size" type="number" min="10" max="120" className={inputCls} value={wm.size} onChange={(e) => set("size", e.target.value)} /></div>
          <div><label className={labelCls}>Opacity</label>
            <input data-testid="watermark-opacity" type="number" min="0.02" max="1" step="0.01" className={inputCls} value={wm.opacity} onChange={(e) => set("opacity", e.target.value)} /></div>
          <div><label className={labelCls}>Position</label>
            <select data-testid="watermark-position" className={inputCls} value={wm.position} onChange={(e) => set("position", e.target.value)}>
              <option value="center">Center (diagonal)</option><option value="footer">Footer</option></select></div>
        </div>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-testid="input-watermark-file" onChange={uploadImage} />
          <button type="button" data-testid="btn-upload-watermark" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
            <Upload className="w-4 h-4" /> Upload watermark image
          </button>
          {wm.image_path && (
            <>
              <img src={imgUrl(wm.image_path)} alt="Watermark" className="h-10 rounded border border-slate-200" data-testid="watermark-image-preview" />
              <button type="button" data-testid="btn-remove-watermark-image"
                onClick={async () => { await api.delete("/admin/watermark/image").catch((e) => toast.error(errMsg(e))); load(); }}
                className="text-xs font-semibold text-red-700 hover:underline">Remove image</button>
            </>
          )}
        </div>
        <button type="submit" data-testid="btn-save-watermark"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg shadow-sm transition-colors">Save Watermark</button>
      </form>
    </Card>
  );
}

function Platform() {
  const [s, setS] = useState(null);
  const [terms, setTerms] = useState([]);
  const [newTerms, setNewTerms] = useState({ version: "", content: "" });
  const load = useCallback(() => {
    api.get("/admin/settings").then((r) => setS(r.data)).catch((e) => toast.error(errMsg(e)));
    api.get("/admin/terms").then((r) => setTerms(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!s) return null;
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put("/admin/settings", {
        plan_price: parseFloat(s.plan_price), free_quote_limit: parseInt(s.free_quote_limit),
        free_invoice_limit: parseInt(s.free_invoice_limit), max_request_images: parseInt(s.max_request_images),
        max_portfolio_images: parseInt(s.max_portfolio_images), image_max_mb: parseInt(s.image_max_mb),
        image_max_dimension: parseInt(s.image_max_dimension), image_allowed_types: s.image_allowed_types,
        support_phone: s.support_phone || "",
      });
      toast.success("Platform settings saved.");
    } catch (e2) { toast.error(errMsg(e2)); }
  };
  const publishTerms = async (e) => {
    e.preventDefault();
    try { await api.post("/admin/terms", newTerms); toast.success("Terms version published."); setNewTerms({ version: "", content: "" }); load(); }
    catch (e2) { toast.error(errMsg(e2)); }
  };

  return (
    <div className="space-y-6">
      <Card title="Platform Settings" testid="admin-platform-card">
        <form onSubmit={save} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div><label className={labelCls}>Plan price ($/mo)</label>
            <input data-testid="platform-plan-price" type="number" min="0.5" step="0.01" className={inputCls} value={s.plan_price} onChange={(e) => set("plan_price", e.target.value)} /></div>
          <div><label className={labelCls}>Free quote limit /mo</label>
            <input data-testid="platform-quote-limit" type="number" min="0" className={inputCls} value={s.free_quote_limit} onChange={(e) => set("free_quote_limit", e.target.value)} /></div>
          <div><label className={labelCls}>Free invoice limit /mo</label>
            <input data-testid="platform-invoice-limit" type="number" min="0" className={inputCls} value={s.free_invoice_limit} onChange={(e) => set("free_invoice_limit", e.target.value)} /></div>
          <div><label className={labelCls}>Support phone</label>
            <input data-testid="platform-support-phone" className={inputCls} value={s.support_phone || ""} onChange={(e) => set("support_phone", e.target.value)} /></div>
          <div><label className={labelCls}>Max request images</label>
            <input data-testid="platform-max-request-images" type="number" min="0" max="10" className={inputCls} value={s.max_request_images} onChange={(e) => set("max_request_images", e.target.value)} /></div>
          <div><label className={labelCls}>Max portfolio images</label>
            <input data-testid="platform-max-portfolio" type="number" min="1" max="30" className={inputCls} value={s.max_portfolio_images} onChange={(e) => set("max_portfolio_images", e.target.value)} /></div>
          <div><label className={labelCls}>Max image size (MB)</label>
            <input data-testid="platform-image-max-mb" type="number" min="1" max="25" className={inputCls} value={s.image_max_mb} onChange={(e) => set("image_max_mb", e.target.value)} /></div>
          <div><label className={labelCls}>Max image dimension (px)</label>
            <input data-testid="platform-image-max-dim" type="number" min="200" max="8000" className={inputCls} value={s.image_max_dimension} onChange={(e) => set("image_max_dimension", e.target.value)} /></div>
          <div className="col-span-2 sm:col-span-4">
            <label className={labelCls}>Allowed image MIME types</label>
            <div className="flex gap-4" data-testid="platform-allowed-types">
              {["image/jpeg", "image/png", "image/webp"].map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" data-testid={`platform-type-${t.split("/")[1]}`} checked={s.image_allowed_types?.includes(t)}
                    onChange={(e) => set("image_allowed_types", e.target.checked ? [...(s.image_allowed_types || []), t] : (s.image_allowed_types || []).filter((x) => x !== t))}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600" />{t}
                </label>
              ))}
            </div>
          </div>
          <button data-testid="btn-save-platform" className="col-span-2 sm:col-span-4 w-fit bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg shadow-sm transition-colors">
            Save Platform Settings
          </button>
        </form>
      </Card>
      <Card title="Terms & Conditions Versions" testid="admin-terms-card">
        <ul className="mb-4 space-y-1.5" data-testid="terms-versions-list">
          {terms.map((t) => (
            <li key={t.id} className="text-sm text-slate-700 flex items-center gap-2">
              <span className="font-mono font-semibold">v{t.version}</span>
              {t.active && <StatusBadge status="active" testid={`terms-active-${t.id}`} />}
              <span className="text-xs text-slate-400">{fmtDate(t.created_at)}</span>
            </li>
          ))}
        </ul>
        <form onSubmit={publishTerms} className="space-y-3 max-w-xl">
          <input data-testid="terms-version" required placeholder="New version (e.g. 1.1)" className={inputCls} value={newTerms.version}
            onChange={(e) => setNewTerms((t) => ({ ...t, version: e.target.value }))} />
          <textarea data-testid="terms-content-input" required rows={4} placeholder="Terms content…" className={inputCls} value={newTerms.content}
            onChange={(e) => setNewTerms((t) => ({ ...t, content: e.target.value }))} />
          <button data-testid="btn-publish-terms" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg shadow-sm transition-colors">
            Publish New Version
          </button>
        </form>
      </Card>
    </div>
  );
}

function AuditLogs() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  useEffect(() => {
    api.get(`/admin/audit-logs?page=${page}&limit=20`).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e)));
  }, [page]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  return (
    <Card title="Audit Logs" testid="admin-audit-card">
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full" data-testid="admin-audit-table">
          <thead><tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <th className="py-3 px-4 text-left">Time</th><th className="py-3 px-4 text-left">Actor</th>
            <th className="py-3 px-4 text-left">Action</th><th className="py-3 px-4 text-left">Target</th>
            <th className="py-3 px-4 text-left hidden md:table-cell">Details</th></tr></thead>
          <tbody>
            {data?.items?.map((l) => (
              <tr key={l.id} data-testid={`audit-row-${l.id}`} className="border-b border-slate-100 text-sm text-slate-700">
                <td className="py-2.5 px-4 text-xs text-slate-500 whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                <td className="py-2.5 px-4 text-xs">{l.actor_email}</td>
                <td className="py-2.5 px-4 font-mono text-xs font-semibold">{l.action}</td>
                <td className="py-2.5 px-4 text-xs">{l.target}</td>
                <td className="py-2.5 px-4 text-xs text-slate-400 hidden md:table-cell">{l.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-center gap-3 mt-4">
        <button data-testid="btn-audit-prev" disabled={page <= 1} onClick={() => setPage(page - 1)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40">Prev</button>
        <span className="text-xs text-slate-500">Page {page} of {pages}</span>
        <button data-testid="btn-audit-next" disabled={page >= pages} onClick={() => setPage(page + 1)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40">Next</button>
      </div>
    </Card>
  );
}

function Documents() {
  const [kind, setKind] = useState("quotes");
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/admin/${kind}?page=1&limit=15`).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e)));
  }, [kind]);
  return (
    <Card testid="admin-docs-card">
      <div className="flex gap-2 mb-4">
        {["quotes", "invoices", "requests", "subscriptions"].map((k) => (
          <button key={k} data-testid={`admin-docs-tab-${k}`} onClick={() => setKind(k)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border capitalize transition-colors ${kind === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>{k}</button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full" data-testid="admin-docs-table">
          <thead><tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <th className="py-3 px-4 text-left">Ref</th><th className="py-3 px-4 text-left">Owner / Pro</th>
            <th className="py-3 px-4 text-left">Party</th><th className="py-3 px-4 text-right">Total</th>
            <th className="py-3 px-4 text-left">Status</th><th className="py-3 px-4 text-left hidden sm:table-cell">Created</th></tr></thead>
          <tbody>
            {data?.items?.map((d) => (
              <tr key={d.id} data-testid={`admin-doc-row-${d.id}`} className="border-b border-slate-100 text-sm text-slate-700">
                <td className="py-3 px-4 font-mono text-xs font-semibold">{d.quote_number || d.invoice_number || d.plan || d.id.slice(-6)}</td>
                <td className="py-3 px-4 text-xs">{d.owner_email || d.pro_email || d.email}</td>
                <td className="py-3 px-4">{d.customer_name || "—"}</td>
                <td className="py-3 px-4 text-right font-semibold">{d.total != null ? fmt(d.total) : d.price != null ? fmt(d.price) : "—"}</td>
                <td className="py-3 px-4"><StatusBadge status={d.status || d.plan || "draft"} testid={`admin-doc-status-${d.id}`} /></td>
                <td className="py-3 px-4 hidden sm:table-cell text-xs text-slate-500">{fmtDate(d.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
