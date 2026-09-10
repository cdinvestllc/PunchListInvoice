import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errMsg, fmtDate, REQUEST_STATUSES, imgUrl } from "@/api";
import { toast } from "@/components/ui/sonner";
import StatusBadge from "@/components/StatusBadge";
import { ArrowRightLeft, Eye, X } from "lucide-react";

export default function Requests() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page, limit: 10 });
    if (status) params.set("status", status);
    api.get(`/requests?${params}`).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e)));
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  const setReqStatus = async (id, s) => {
    try {
      await api.put(`/requests/${id}/status`, { status: s });
      toast.success(`Status updated to ${s}.`);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const convert = async (id) => {
    try {
      const { data: r } = await api.post(`/requests/${id}/convert`);
      toast.success("Quote created from request.");
      navigate(`/quotes/${r.id}`);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div data-testid="requests-page">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>Estimate Requests</h1>
        <p className="text-sm text-slate-500 mt-1">Inbound leads from your public profile</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button data-testid="filter-tab-all" onClick={() => { setStatus(""); setPage(1); }}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${!status ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>All</button>
        {REQUEST_STATUSES.map((s) => (
          <button key={s} data-testid={`filter-tab-${s}`} onClick={() => { setStatus(s); setPage(1); }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border capitalize transition-colors ${status === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>{s}</button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full" data-testid="requests-table">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="py-3 px-4 text-left">Customer</th>
              <th className="py-3 px-4 text-left hidden sm:table-cell">Service</th>
              <th className="py-3 px-4 text-left hidden md:table-cell">Requested</th>
              <th className="py-3 px-4 text-left">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.items?.length === 0 && (
              <tr><td colSpan={5} className="py-12 text-center text-sm text-slate-400" data-testid="requests-empty">
                No estimate requests yet. Share your public profile to receive leads.
              </td></tr>
            )}
            {data?.items?.map((r) => (
              <tr key={r.id} data-testid={`request-row-${r.id}`} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors text-sm text-slate-700">
                <td className="py-3.5 px-4">
                  <p className="font-medium text-slate-900">{r.customer_name}</p>
                  <p className="text-xs text-slate-400">{r.customer_email}</p>
                </td>
                <td className="py-3.5 px-4 hidden sm:table-cell">{r.service}</td>
                <td className="py-3.5 px-4 hidden md:table-cell text-slate-500">{fmtDate(r.created_at)}</td>
                <td className="py-3.5 px-4">
                  <select data-testid={`request-status-${r.id}`} value={r.status} onChange={(e) => setReqStatus(r.id, e.target.value)}
                    className="text-xs font-semibold rounded-lg border border-slate-300 px-2 py-1.5 bg-white capitalize focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {REQUEST_STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
                  </select>
                </td>
                <td className="py-3.5 px-4">
                  <div className="flex items-center justify-end gap-1">
                    <button title="View details" data-testid={`btn-view-request-${r.id}`} onClick={() => setView(r)}
                      className="p-1.5 text-slate-400 hover:text-slate-800 transition-colors"><Eye className="w-4 h-4" /></button>
                    {r.quote_id ? (
                      <span className="text-xs text-slate-400 px-2">Quoted</span>
                    ) : (
                      <button title="Convert to quote" data-testid={`btn-convert-to-quote-${r.id}`} onClick={() => convert(r.id)}
                        className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
                        <ArrowRightLeft className="w-3.5 h-3.5" /> Convert to Quote
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button data-testid="btn-prev-page" disabled={page <= 1} onClick={() => setPage(page - 1)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40">Prev</button>
          <span className="text-xs text-slate-500">Page {page} of {pages}</span>
          <button data-testid="btn-next-page" disabled={page >= pages} onClick={() => setPage(page + 1)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40">Next</button>
        </div>
      )}

      {view && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="request-detail-modal">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setView(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{view.customer_name}</h2>
                <StatusBadge status={view.status} testid="request-detail-status" />
              </div>
              <button data-testid="btn-close-request-modal" onClick={() => setView(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <dl className="space-y-2.5 text-sm">
              {[["Phone", view.customer_phone], ["Email", view.customer_email], ["Address", view.address],
                ["Service", view.service], ["Timeframe", view.timeframe], ["Preferred contact", view.contact_method]].map(([k, v]) => (
                <div key={k} className="flex gap-2"><dt className="w-32 shrink-0 text-slate-500 font-medium">{k}</dt><dd className="text-slate-900">{v || "—"}</dd></div>
              ))}
              <div><dt className="text-slate-500 font-medium mb-1">Project description</dt>
                <dd className="text-slate-900 bg-slate-50 rounded-lg p-3">{view.description}</dd></div>
            </dl>
            {view.images?.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2" data-testid="request-images">
                {view.images.map((img) => (
                  <img key={img.id} src={imgUrl(img.file_path)} alt="Project" className="rounded-lg border border-slate-200 object-cover h-32 w-full" />
                ))}
              </div>
            )}
            {!view.quote_id && (
              <button data-testid="btn-convert-modal" onClick={() => convert(view.id)}
                className="mt-5 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
                Convert to Quote
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
