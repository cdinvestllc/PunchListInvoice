import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errMsg, fmt, fmtDate, QUOTE_STATUSES, INVOICE_STATUSES } from "@/api";
import { toast } from "@/components/ui/sonner";
import StatusBadge from "@/components/StatusBadge";
import { Plus, Search, FileDown, Send, ArrowRightLeft, Trash2, CheckCircle2 } from "lucide-react";

export default function DocList({ kind }) {
  const isInvoice = kind === "invoice";
  const base = isInvoice ? "/invoices" : "/quotes";
  const statuses = isInvoice ? INVOICE_STATUSES : QUOTE_STATUSES;
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page, limit: 10 });
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    api.get(`${base}?${params}`).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e)));
  }, [base, status, q, page]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn, msg) => {
    try {
      await fn();
      if (msg) toast.success(msg);
      load();
    } catch (e) {
      toast.error(errMsg(e), e?.response?.status === 402 ? { action: { label: "Upgrade", onClick: () => navigate("/upgrade") } } : undefined);
    }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div data-testid={isInvoice ? "invoices-page" : "quotes-page"}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
            {isInvoice ? "Invoices" : "Quotes"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{isInvoice ? "Track billing and payments" : "Win more jobs with fast estimates"}</p>
        </div>
        <Link to={`${base}/new`} data-testid={isInvoice ? "btn-new-invoice" : "btn-new-quote"}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-colors">
          <Plus className="w-4 h-4" /> New {isInvoice ? "Invoice" : "Quote"}
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button data-testid="filter-tab-all" onClick={() => { setStatus(""); setPage(1); }}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${!status ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
          All
        </button>
        {statuses.map((s) => (
          <button key={s} data-testid={`filter-tab-${s}`} onClick={() => { setStatus(s); setPage(1); }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border capitalize transition-colors ${status === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
            {s}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input data-testid="search-input" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search client or number…"
            className="pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 bg-white w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full" data-testid={isInvoice ? "invoices-table" : "quotes-table"}>
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="py-3 px-4 text-left">Number</th>
              <th className="py-3 px-4 text-left">Client</th>
              <th className="py-3 px-4 text-left hidden sm:table-cell">Date</th>
              <th className="py-3 px-4 text-right">Total</th>
              <th className="py-3 px-4 text-left">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.items?.length === 0 && (
              <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-400" data-testid="docs-empty">
                Nothing here yet. Create your first {kind}.
              </td></tr>
            )}
            {data?.items?.map((d) => {
              const num = d.quote_number || d.invoice_number;
              return (
                <tr key={d.id} data-testid={`doc-row-${d.id}`} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors text-sm text-slate-700">
                  <td className="py-3.5 px-4">
                    <Link to={`${base}/${d.id}`} data-testid={`doc-link-${d.id}`} className="font-semibold text-blue-700 hover:underline">{num}</Link>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-900">{d.customer_name}</td>
                  <td className="py-3.5 px-4 hidden sm:table-cell text-slate-500">{fmtDate(d.issue_date)}</td>
                  <td className="py-3.5 px-4 text-right font-semibold text-slate-900">{fmt(d.total)}</td>
                  <td className="py-3.5 px-4"><StatusBadge status={d.status} testid={`doc-status-${d.id}`} /></td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center justify-end gap-1">
                      {d.status === "draft" && (
                        <button title="Mark sent" data-testid={`btn-send-${d.id}`}
                          onClick={() => act(() => api.post(`${base}/${d.id}/send`), "Marked as sent.")}
                          className="p-1.5 text-slate-400 hover:text-sky-600 transition-colors"><Send className="w-4 h-4" /></button>
                      )}
                      {isInvoice && ["sent", "overdue"].includes(d.status) && (
                        <button title="Mark paid" data-testid={`btn-mark-paid-${d.id}`}
                          onClick={() => act(() => api.post(`${base}/${d.id}/mark-paid`), "Marked as paid.")}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"><CheckCircle2 className="w-4 h-4" /></button>
                      )}
                      <button title="PDF" data-testid={`btn-pdf-${d.id}`}
                        onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api${base}/${d.id}/pdf`, "_blank")}
                        className="p-1.5 text-slate-400 hover:text-slate-800 transition-colors"><FileDown className="w-4 h-4" /></button>
                      {!isInvoice && (
                        <button title="Convert to invoice" data-testid={`btn-convert-${d.id}`}
                          onClick={() => act(async () => {
                            const { data: r } = await api.post(`/quotes/${d.id}/convert-to-invoice`);
                            navigate(`/invoices/${r.id}`);
                          })}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"><ArrowRightLeft className="w-4 h-4" /></button>
                      )}
                      <button title="Delete" data-testid={`btn-delete-${d.id}`}
                        onClick={() => { if (window.confirm(`Delete ${num}?`)) act(() => api.delete(`${base}/${d.id}`), "Deleted."); }}
                        className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4" data-testid="pagination">
          <button data-testid="btn-prev-page" disabled={page <= 1} onClick={() => setPage(page - 1)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40">Prev</button>
          <span className="text-xs text-slate-500">Page {page} of {pages}</span>
          <button data-testid="btn-next-page" disabled={page >= pages} onClick={() => setPage(page + 1)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
