import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, errMsg, fmt, QUOTE_STATUSES, INVOICE_STATUSES } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/components/ui/sonner";
import { ArrowLeft, Plus, Trash2, FileDown, Send, ArrowRightLeft } from "lucide-react";

const EMPTY = {
  customer_name: "", customer_email: "", customer_phone: "", customer_address: "",
  job_description: "", issue_date: new Date().toISOString().slice(0, 10),
  expiry_date: "", due_date: "", tax_rate: 0, status: "draft", notes: "", items: [],
};

export default function DocForm({ kind }) {
  const isInvoice = kind === "invoice";
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [docNumber, setDocNumber] = useState(null);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const base = isInvoice ? "/invoices" : "/quotes";
  const statuses = isInvoice ? INVOICE_STATUSES : QUOTE_STATUSES;

  useEffect(() => {
    if (id) {
      api.get(`${base}/${id}`).then((r) => {
        const d = r.data;
        setDocNumber(d.quote_number || d.invoice_number);
        setForm({
          customer_name: d.customer_name || "", customer_email: d.customer_email || "",
          customer_phone: d.customer_phone || "", customer_address: d.customer_address || "",
          job_description: d.job_description || "", issue_date: d.issue_date || EMPTY.issue_date,
          expiry_date: d.expiry_date || "", due_date: d.due_date || "", tax_rate: d.tax_rate ?? 0,
          status: d.status || "draft", notes: d.notes || "",
          items: (d.items || []).map((i) => ({ description: i.description, qty: i.qty, unit_price: i.unit_price })),
        });
        setLoading(false);
      }).catch((e) => { toast.error(errMsg(e)); navigate(base); });
    } else {
      setForm((f) => ({ ...f, tax_rate: user?.professional?.default_tax_rate ?? 0 }));
    }
  }, [id]); // eslint-disable-line

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setItem = (i, k, v) => setForm((f) => {
    const items = [...f.items];
    items[i] = { ...items[i], [k]: k === "description" ? v : v };
    return { ...f, items };
  });
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { description: "", qty: 1, unit_price: 0 }] }));
  const removeItem = (i) => setForm((f) => ({ ...f, items: f.items.filter((_, n) => n !== i) }));

  const subtotal = form.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unit_price) || 0), 0);
  const tax = subtotal * ((parseFloat(form.tax_rate) || 0) / 100);
  const total = subtotal + tax;

  const save = async (e) => {
    e?.preventDefault();
    if (!form.customer_name.trim()) return toast.error("Client name is required.");
    const cleanItems = form.items
      .filter((i) => i.description.trim())
      .map((i) => ({ description: i.description.trim(), qty: parseFloat(i.qty) || 0, unit_price: parseFloat(i.unit_price) || 0 }));
    const payload = { ...form, tax_rate: parseFloat(form.tax_rate) || 0, items: cleanItems,
      expiry_date: form.expiry_date || null, due_date: form.due_date || null };
    setSaving(true);
    try {
      const res = id ? await api.put(`${base}/${id}`, payload) : await api.post(base, payload);
      toast.success(`${isInvoice ? "Invoice" : "Quote"} ${id ? "updated" : "created"} (${res.data.quote_number || res.data.invoice_number})`);
      await refresh();
      navigate(base);
    } catch (e2) {
      const msg = errMsg(e2);
      toast.error(msg, e2?.response?.status === 402 ? { action: { label: "Upgrade", onClick: () => navigate("/upgrade") } } : undefined);
    } finally {
      setSaving(false);
    }
  };

  const openPdf = () => window.open(`${process.env.REACT_APP_BACKEND_URL}/api${base}/${id}/pdf`, "_blank");
  const sendDoc = async () => {
    try {
      await api.post(`${base}/${id}/send`);
      toast.success("Marked as sent.");
      set("status", "sent");
      await refresh();
    } catch (e2) {
      toast.error(errMsg(e2), e2?.response?.status === 402 ? { action: { label: "Upgrade", onClick: () => navigate("/upgrade") } } : undefined);
    }
  };
  const convert = async () => {
    try {
      const { data } = await api.post(`/quotes/${id}/convert-to-invoice`);
      toast.success("Invoice created from quote.");
      navigate(`/invoices/${data.id}`);
    } catch (e2) { toast.error(errMsg(e2)); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete ${docNumber}? This cannot be undone.`)) return;
    try {
      await api.delete(`${base}/${id}`);
      toast.success("Deleted.");
      navigate(base);
    } catch (e2) { toast.error(errMsg(e2)); }
  };

  if (loading) return <div className="py-20 text-center text-slate-400 text-sm">Loading…</div>;

  const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow";
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5";

  return (
    <form onSubmit={save} data-testid={isInvoice ? "invoice-form" : "quote-form"}>
      <Link to={base} data-testid="link-back" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to {isInvoice ? "Invoices" : "Quotes"}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-2 mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}
          data-testid="doc-form-title">
          {id ? `${docNumber}` : `New ${isInvoice ? "Invoice" : "Quote"}`}
          {id && <span className="ml-3 text-sm font-normal text-slate-500 capitalize">({form.status})</span>}
        </h1>
        {id && (
          <div className="flex items-center gap-2">
            <button type="button" data-testid="btn-pdf" onClick={openPdf}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
              <FileDown className="w-3.5 h-3.5" /> PDF
            </button>
            {form.status === "draft" && (
              <button type="button" data-testid="btn-send-doc" onClick={sendDoc}
                className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-3 py-2 rounded-lg hover:bg-sky-100 transition-colors">
                <Send className="w-3.5 h-3.5" /> Mark Sent
              </button>
            )}
            {!isInvoice && (
              <button type="button" data-testid="btn-convert-invoice" onClick={convert}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg hover:bg-emerald-100 transition-colors">
                <ArrowRightLeft className="w-3.5 h-3.5" /> Convert to Invoice
              </button>
            )}
            <button type="button" data-testid="btn-delete-doc" onClick={remove}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg hover:bg-red-100 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-1">Client Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div>
                <label className={labelCls} htmlFor="input-client-name">Client Name *</label>
                <input id="input-client-name" data-testid="input-client-name" className={inputCls} value={form.customer_name}
                  onChange={(e) => set("customer_name", e.target.value)} placeholder="John Smith" maxLength={120} />
              </div>
              <div>
                <label className={labelCls} htmlFor="input-client-phone">Phone</label>
                <input id="input-client-phone" data-testid="input-client-phone" className={inputCls} value={form.customer_phone}
                  onChange={(e) => set("customer_phone", e.target.value)} placeholder="(555) 000-0000" maxLength={40} />
              </div>
              <div>
                <label className={labelCls} htmlFor="input-client-email">Email</label>
                <input id="input-client-email" data-testid="input-client-email" type="email" className={inputCls} value={form.customer_email}
                  onChange={(e) => set("customer_email", e.target.value)} placeholder="john@example.com" maxLength={120} />
              </div>
              <div>
                <label className={labelCls} htmlFor="input-client-address">Address</label>
                <input id="input-client-address" data-testid="input-client-address" className={inputCls} value={form.customer_address}
                  onChange={(e) => set("customer_address", e.target.value)} placeholder="123 Main St, City, State" maxLength={300} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="input-job-description">Job Description</label>
                <textarea id="input-job-description" data-testid="input-job-description" rows={2} className={inputCls}
                  value={form.job_description} onChange={(e) => set("job_description", e.target.value)}
                  placeholder="Briefly describe the job..." maxLength={2000} />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-1">Dates</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div>
                <label className={labelCls} htmlFor="input-issue-date">{isInvoice ? "Invoice Date" : "Quote Date"}</label>
                <input id="input-issue-date" data-testid="input-issue-date" type="date" className={inputCls}
                  value={form.issue_date} onChange={(e) => set("issue_date", e.target.value)} />
              </div>
              <div>
                <label className={labelCls} htmlFor="input-end-date">{isInvoice ? "Due Date" : "Expiry Date"}</label>
                <input id="input-end-date" data-testid={isInvoice ? "input-due-date" : "input-expiry-date"} type="date" className={inputCls}
                  value={isInvoice ? form.due_date : form.expiry_date}
                  onChange={(e) => set(isInvoice ? "due_date" : "expiry_date", e.target.value)} />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Line Items</h2>
            {form.items.length === 0 && (
              <p className="text-sm text-slate-400 mb-4" data-testid="line-items-empty">No line items yet. Add one below.</p>
            )}
            {form.items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-2">Description</th>
                      <th className="py-2 pr-2 w-20">Qty</th>
                      <th className="py-2 pr-2 w-28">Unit Price</th>
                      <th className="py-2 pr-2 w-24 text-right">Total</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((it, i) => (
                      <tr key={i} className="border-b border-slate-100" data-testid={`line-item-row-${i}`}>
                        <td className="py-2 pr-2">
                          <input data-testid={`line-item-description-${i}`} className={inputCls} value={it.description}
                            onChange={(e) => setItem(i, "description", e.target.value)} placeholder="Labor, materials…" maxLength={200} />
                        </td>
                        <td className="py-2 pr-2">
                          <input data-testid={`line-item-qty-${i}`} type="number" min="0" step="any" className={inputCls} value={it.qty}
                            onChange={(e) => setItem(i, "qty", e.target.value)} />
                        </td>
                        <td className="py-2 pr-2">
                          <input data-testid={`line-item-price-${i}`} type="number" min="0" step="any" className={inputCls} value={it.unit_price}
                            onChange={(e) => setItem(i, "unit_price", e.target.value)} />
                        </td>
                        <td className="py-2 pr-2 text-right font-medium text-slate-900" data-testid={`line-item-total-${i}`}>
                          {fmt((parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0))}
                        </td>
                        <td className="py-2 text-right">
                          <button type="button" data-testid={`line-item-remove-${i}`} onClick={() => removeItem(i)}
                            className="text-slate-400 hover:text-red-600 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button type="button" data-testid="btn-add-line-item" onClick={addItem}
              className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors">
              <Plus className="w-4 h-4" /> Add Line Item
            </button>
            <p className="mt-4 text-right text-sm text-slate-600">
              Subtotal: <span className="font-semibold text-slate-900" data-testid="line-items-subtotal">{fmt(subtotal)}</span>
            </p>
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Totals</h2>
            <label className={labelCls} htmlFor="input-tax-rate">Tax Rate (%)</label>
            <input id="input-tax-rate" data-testid="input-tax-rate" type="number" min="0" max="100" step="any"
              className={inputCls} value={form.tax_rate} onChange={(e) => set("tax_rate", e.target.value)} />
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt>
                <dd className="font-medium text-slate-900" data-testid="totals-subtotal">{fmt(subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Tax ({parseFloat(form.tax_rate) || 0}%)</dt>
                <dd className="font-medium text-slate-900" data-testid="totals-tax">{fmt(tax)}</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <dt className="font-semibold text-slate-900">Total</dt>
                <dd className="font-bold text-blue-700 text-base" data-testid="totals-total">{fmt(total)}</dd></div>
            </dl>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Status & Notes</h2>
            <label className={labelCls} htmlFor="select-status">Status</label>
            <select id="select-status" data-testid="select-status" className={inputCls} value={form.status}
              onChange={(e) => set("status", e.target.value)}>
              {statuses.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
            <label className={`${labelCls} mt-4`} htmlFor="input-notes">Notes</label>
            <textarea id="input-notes" data-testid="input-notes" rows={3} className={inputCls} value={form.notes}
              onChange={(e) => set("notes", e.target.value)} placeholder="Any additional notes..." maxLength={2000} />
            {form.status === "sent" && user?.limits?.[isInvoice ? "invoice_limit" : "quote_limit"] != null && (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2" data-testid="send-limit-hint">
                Free Mode: sending counts toward your monthly limit ({isInvoice ? user.limits.invoice_limit : user.limits.quote_limit} {isInvoice ? "invoices" : "quotes"}).
              </p>
            )}
          </section>

          <div className="flex gap-3">
            <Link to={base} data-testid="btn-cancel"
              className="flex-1 text-center text-sm font-semibold text-slate-600 bg-white border border-slate-300 px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors">
              Cancel
            </Link>
            <button type="submit" data-testid="btn-save-doc" disabled={saving}
              className="flex-1 text-sm font-semibold text-white bg-blue-600 px-4 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : `${id ? "Update" : "Create"} ${isInvoice ? "Invoice" : "Quote"}`}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
