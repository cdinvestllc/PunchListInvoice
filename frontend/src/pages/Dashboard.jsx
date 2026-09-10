import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmt, fmtDate } from "@/api";
import { useAuth } from "@/context/AuthContext";
import StatusBadge from "@/components/StatusBadge";
import { Plus, FileText, ReceiptText, Inbox, ArrowRight } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard").then((r) => setData(r.data)).catch(() => {});
  }, []);

  if (!user) return null;
  if (user.role === "customer") {
    return (
      <div data-testid="dashboard-page" className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>Welcome, {user.name}</h1>
        <p className="text-sm text-slate-500 mt-2">Customer accounts can request estimates from any public pro profile — no pro account needed.</p>
      </div>
    );
  }

  const m = data?.metrics;
  const cards = [
    { id: "outstanding", label: "Outstanding", value: fmt(m?.outstanding), desc: "Sent + overdue invoices", cls: "text-amber-600" },
    { id: "paid-this-month", label: "Paid This Month", value: fmt(m?.paid_this_month), desc: "Collected so far", cls: "text-emerald-600" },
    { id: "open-quotes", label: "Open Quotes", value: m?.open_quotes ?? "—", desc: "Draft + sent", cls: "text-blue-600" },
    { id: "overdue", label: "Overdue", value: m?.overdue ?? "—", desc: `Overdue invoices (${fmt(m?.overdue_amount)})`, cls: "text-rose-600" },
  ];

  return (
    <div data-testid="dashboard-page">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Your business at a glance</p>
        </div>
        {user.role === "pro" && (
          <div className="flex gap-2">
            <Link to="/quotes/new" data-testid="btn-new-quote"
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-colors">
              <Plus className="w-4 h-4" /> New Quote
            </Link>
            <Link to="/invoices/new" data-testid="btn-new-invoice"
              className="flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> New Invoice
            </Link>
          </div>
        )}
      </div>

      {data?.new_requests > 0 && (
        <Link to="/requests" data-testid="banner-new-requests"
          className="mb-6 flex items-center justify-between bg-blue-600 text-white rounded-xl px-5 py-3.5 shadow-sm hover:bg-blue-700 transition-colors">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Inbox className="w-4 h-4" /> {data.new_requests} new estimate request{data.new_requests > 1 ? "s" : ""} waiting
          </span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.id} data-testid={`metric-${c.id}`} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{c.label}</p>
            <p className={`text-2xl font-bold mt-2 ${c.cls}`} style={{ fontFamily: "Outfit, sans-serif" }}>{c.value}</p>
            <p className="text-xs text-slate-400 mt-1">{c.desc}</p>
          </div>
        ))}
      </div>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
        </div>
        {!data?.recent?.length ? (
          <p className="text-sm text-slate-400 px-6 py-10 text-center" data-testid="recent-empty">
            No activity yet. Create your first quote to get started.
          </p>
        ) : (
          <ul data-testid="recent-activity-list">
            {data.recent.map((r) => (
              <li key={`${r.type}-${r.id}`}>
                <Link to={`/${r.type === "quote" ? "quotes" : "invoices"}/${r.id}`} data-testid={`recent-${r.type}-${r.id}`}
                  className="flex items-center gap-4 px-5 sm:px-6 py-3.5 border-b border-slate-50 hover:bg-slate-50/80 transition-colors">
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${r.type === "quote" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"}`}>
                    {r.type === "quote" ? <FileText className="w-4 h-4" /> : <ReceiptText className="w-4 h-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{r.customer}</p>
                    <p className="text-xs text-slate-400">{r.number} · {fmtDate(r.date)}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{fmt(r.total)}</span>
                  <StatusBadge status={r.status} testid={`recent-status-${r.id}`} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
