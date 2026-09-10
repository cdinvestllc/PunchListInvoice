import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, errMsg, imgUrl } from "@/api";
import { toast } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/sonner";
import { Phone, Mail, MapPin, Wrench, X, ImagePlus, Send, Zap } from "lucide-react";

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow";
const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5";

export default function PublicProfile() {
  const { slug } = useParams();
  const [pro, setPro] = useState(null);
  const [config, setConfig] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", service: "", description: "", timeframe: "Flexible", contact_method: "Phone" });
  const [images, setImages] = useState([]);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get(`/public/pros/${slug}`).then((r) => setPro(r.data)).catch(() => setNotFound(true));
    api.get("/public/config").then((r) => setConfig(r.data)).catch(() => {});
  }, [slug]);

  useEffect(() => {
    if (pro) {
      document.title = `${pro.display_name} — ${pro.primary_trade} | Quote Flow`;
      const setMeta = (property, content) => {
        let el = document.querySelector(`meta[property="${property}"]`);
        if (!el) { el = document.createElement("meta"); el.setAttribute("property", property); document.head.appendChild(el); }
        el.setAttribute("content", content);
      };
      setMeta("og:title", `${pro.display_name} — ${pro.primary_trade}`);
      setMeta("og:description", (pro.description || `Request an estimate from ${pro.display_name}`).slice(0, 200));
      setMeta("og:type", "profile");
      setMeta("og:url", window.location.href);
    }
  }, [pro]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4" data-testid="profile-not-found">
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center max-w-sm">
          <h1 className="text-xl font-bold text-slate-900">Profile not available</h1>
          <p className="text-sm text-slate-500 mt-2">This pro profile doesn't exist or isn't public right now.</p>
        </div>
      </div>
    );
  }
  if (!pro) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  const maxImages = config?.max_request_images ?? 4;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const addImages = (e) => {
    const files = Array.from(e.target.files || []);
    const next = [...images, ...files].slice(0, maxImages);
    if (images.length + files.length > maxImages) toast.error(`Maximum ${maxImages} images allowed.`);
    setImages(next);
    e.target.value = "";
  };

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      images.forEach((f) => fd.append("images", f));
      await api.post(`/public/pros/${slug}/requests`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setSubmitted(true);
    } catch (e2) {
      toast.error(errMsg(e2));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100" data-testid="public-profile-page">
      <Toaster position="top-right" richColors />
      <header className="bg-slate-900 py-4 px-4">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center"><Zap className="w-4 h-4 text-white" /></div>
          <span className="text-white font-bold tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>Quote Flow</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 sm:p-6">
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" data-testid="business-card">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-8 sm:px-8">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center overflow-hidden shrink-0">
                {pro.avatar_path || pro.logo_path
                  ? <img src={imgUrl(pro.avatar_path || pro.logo_path)} alt={pro.display_name} className="object-cover w-full h-full" />
                  : <span className="text-white font-bold text-xl">{pro.display_name?.slice(0, 1)}</span>}
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight truncate" style={{ fontFamily: "Outfit, sans-serif" }}
                  data-testid="public-business-name">{pro.display_name}</h1>
                <p className="text-slate-300 text-sm">{pro.pro_name}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-200 bg-blue-600/30 border border-blue-500/40 px-3 py-1 rounded-full" data-testid="public-trade">
                <Wrench className="w-3 h-3" /> {pro.primary_trade}
              </span>
            </div>
          </div>

          <div className="px-6 py-6 sm:px-8">
            {pro.description && <p className="text-sm text-slate-700 leading-relaxed" data-testid="public-description">{pro.description}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 text-sm">
              {pro.phone && <a href={`tel:${pro.phone}`} data-testid="public-phone" className="flex items-center gap-2.5 text-slate-700 hover:text-blue-700 transition-colors">
                <Phone className="w-4 h-4 text-slate-400" /> {pro.phone}</a>}
              {pro.email && <a href={`mailto:${pro.email}`} data-testid="public-email" className="flex items-center gap-2.5 text-slate-700 hover:text-blue-700 transition-colors">
                <Mail className="w-4 h-4 text-slate-400" /> {pro.email}</a>}
              {pro.address && <p data-testid="public-address" className="flex items-center gap-2.5 text-slate-700 sm:col-span-2">
                <MapPin className="w-4 h-4 text-slate-400" /> {pro.address}</p>}
            </div>
            <button data-testid="btn-request-estimate" onClick={() => { setShowForm(true); setSubmitted(false); }}
              className="mt-6 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-8 py-3 rounded-xl shadow-sm transition-colors">
              Request an Estimate
            </button>
          </div>
        </section>

        {pro.portfolio?.length > 0 && (
          <section className="mt-6" data-testid="public-portfolio">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Recent Work</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {pro.portfolio.map((p, i) => (
                <figure key={p.id} data-testid={`public-portfolio-${i}`} className="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
                  <img src={imgUrl(p.file_path)} alt={p.caption || "Work sample"} className="object-cover w-full h-32" loading="lazy" />
                  {p.caption && <figcaption className="text-xs text-slate-500 px-2.5 py-2">{p.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </section>
        )}

        <p className="text-center text-xs text-slate-400 mt-8">Powered by Quote Flow — fast quotes for every trade</p>
      </main>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" data-testid="estimate-request-modal">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-6">
            {submitted ? (
              <div className="text-center py-8" data-testid="request-confirmation">
                <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Send className="w-6 h-6 text-emerald-700" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Request sent!</h2>
                <p className="text-sm text-slate-500 mt-2">{pro.display_name} has been notified and will contact you via {form.contact_method.toLowerCase()} soon.</p>
                <button data-testid="btn-close-confirmation" onClick={() => setShowForm(false)}
                  className="mt-6 text-sm font-semibold text-blue-600 hover:underline">Close</button>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>Request an Estimate</h2>
                    <p className="text-xs text-slate-400 mt-0.5">from {pro.display_name}</p>
                  </div>
                  <button data-testid="btn-close-request-form" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={submit} className="space-y-3.5" data-testid="estimate-request-form">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className={labelCls} htmlFor="req-name">Name *</label>
                      <input id="req-name" data-testid="req-name" required className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="req-phone">Phone *</label>
                      <input id="req-phone" data-testid="req-phone" required className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="req-email">Email *</label>
                    <input id="req-email" data-testid="req-email" type="email" required className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="req-address">Project Address *</label>
                    <input id="req-address" data-testid="req-address" required className={inputCls} value={form.address} onChange={(e) => set("address", e.target.value)} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className={labelCls} htmlFor="req-service">Service Needed *</label>
                      <input id="req-service" data-testid="req-service" required className={inputCls} value={form.service}
                        onChange={(e) => set("service", e.target.value)} placeholder={pro.primary_trade} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="req-timeframe">Preferred Timeframe</label>
                      <select id="req-timeframe" data-testid="req-timeframe" className={inputCls} value={form.timeframe} onChange={(e) => set("timeframe", e.target.value)}>
                        {(config?.timeframes || ["ASAP", "Within 2 weeks", "Within a month", "Flexible"]).map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="req-description">Project Description *</label>
                    <textarea id="req-description" data-testid="req-description" rows={3} required className={inputCls}
                      value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Describe the work you need done…" />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="req-contact">Preferred Contact Method</label>
                    <select id="req-contact" data-testid="req-contact-method" className={inputCls} value={form.contact_method} onChange={(e) => set("contact_method", e.target.value)}>
                      {(config?.contact_methods || ["Phone", "Email", "Text"]).map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Photos (up to {maxImages}, max {config?.image_max_mb ?? 5} MB each)</label>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
                      data-testid="req-images-input" onChange={addImages} />
                    <button type="button" data-testid="btn-add-request-images" onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-dashed border-blue-300 px-3 py-2.5 rounded-lg hover:bg-blue-100 transition-colors w-full justify-center">
                      <ImagePlus className="w-4 h-4" /> Add photos
                    </button>
                    {images.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 mt-2" data-testid="req-image-previews">
                        {images.map((f, i) => (
                          <div key={i} className="relative group" data-testid={`req-image-preview-${i}`}>
                            <img src={URL.createObjectURL(f)} alt="Preview" className="object-cover w-full h-16 rounded-lg border border-slate-200" />
                            <button type="button" data-testid={`req-image-remove-${i}`} onClick={() => setImages(images.filter((_, n) => n !== i))}
                              className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5 opacity-90 hover:opacity-100">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button type="submit" data-testid="btn-submit-request" disabled={sending}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-3 rounded-xl shadow-sm disabled:opacity-50 transition-colors">
                    {sending ? "Sending…" : "Send Estimate Request"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
