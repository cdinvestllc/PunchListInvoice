import { useCallback, useEffect, useRef, useState } from "react";
import { api, errMsg, imgUrl } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/components/ui/sonner";
import { Upload, Trash2, Lock, Copy, ExternalLink, ChevronUp, ChevronDown, Camera } from "lucide-react";

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow";
const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5";

export default function Profile() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ display_name: "", description: "", is_public: false });
  const [portfolio, setPortfolio] = useState([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const avatarRef = useRef(null);

  const isPaid = user?.subscription?.plan === "pro" && ["active", "canceled"].includes(user?.subscription?.status);
  const maxImages = user?.settings?.max_portfolio_images ?? 8;
  const publicUrl = user?.profile ? `${window.location.origin}/pro/${user.profile.slug}` : null;

  const loadPortfolio = useCallback(() => {
    api.get("/profile/portfolio").then((r) => setPortfolio(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.profile) {
      setForm({
        display_name: user.profile.display_name || "",
        description: user.profile.description || "",
        is_public: !!user.profile.is_public,
      });
    }
    loadPortfolio();
  }, [user, loadPortfolio]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/profile", form);
      toast.success("Profile saved.");
      await refresh();
    } catch (e2) { toast.error(errMsg(e2)); } finally { setSaving(false); }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Public profile URL copied.");
    } catch {
      toast.info(publicUrl);
    }
  };

  const uploadAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api.post("/profile/avatar", fd);
      toast.success("Avatar updated.");
      await refresh();
    } catch (e2) { toast.error(errMsg(e2)); }
    e.target.value = "";
  };

  const uploadPortfolio = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api.post("/profile/portfolio", fd);
      toast.success("Portfolio image added.");
      loadPortfolio();
    } catch (e2) { toast.error(errMsg(e2)); }
    e.target.value = "";
  };

  const removeImage = async (id) => {
    try {
      await api.delete(`/profile/portfolio/${id}`);
      loadPortfolio();
    } catch (e2) { toast.error(errMsg(e2)); }
  };

  const move = async (index, dir) => {
    const next = [...portfolio];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setPortfolio(next);
    try {
      await api.put("/profile/portfolio-reorder", { order: next.map((p) => p.id) });
    } catch (e2) { toast.error(errMsg(e2)); loadPortfolio(); }
  };

  const saveCaption = async (id, caption) => {
    try {
      await api.put(`/profile/portfolio/${id}`, { caption });
      toast.success("Caption saved.");
    } catch (e2) { toast.error(errMsg(e2)); }
  };

  return (
    <div data-testid="profile-page" className="max-w-3xl">
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>Public Profile</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">Your business-card page customers can view and request estimates from</p>

      <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center" data-testid="avatar-preview">
            {user?.profile?.avatar_path
              ? <img src={imgUrl(user.profile.avatar_path)} alt="Avatar" className="object-cover w-full h-full" />
              : <Camera className="w-6 h-6 text-slate-300" />}
          </div>
          <div>
            <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" data-testid="input-avatar-file" onChange={uploadAvatar} />
            <button type="button" data-testid="btn-upload-avatar" onClick={() => avatarRef.current?.click()}
              className="text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors">
              Upload avatar
            </button>
            <p className="text-xs text-slate-400 mt-1.5">Optional photo or mark shown on your public page.</p>
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="prof-display">Display Name</label>
          <input id="prof-display" data-testid="profile-display-name" className={inputCls} value={form.display_name}
            onChange={(e) => set("display_name", e.target.value)} maxLength={120} />
        </div>
        <div>
          <label className={labelCls} htmlFor="prof-desc">Description</label>
          <textarea id="prof-desc" data-testid="profile-description" rows={4} className={inputCls} value={form.description}
            onChange={(e) => set("description", e.target.value)} maxLength={2000}
            placeholder="Tell customers about your experience, services and service area…" />
        </div>
        <label className="flex items-center gap-3" data-testid="profile-public-toggle-label">
          <input type="checkbox" data-testid="profile-public-toggle" checked={form.is_public}
            onChange={(e) => set("is_public", e.target.checked)} disabled={!isPaid}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40" />
          <span className="text-sm text-slate-700 font-medium">
            Publish my public profile
            {!isPaid && <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-700"><Lock className="w-3 h-3" /> Full Mode only</span>}
          </span>
        </label>
        <button type="submit" data-testid="btn-save-profile" disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg shadow-sm disabled:opacity-50 transition-colors">
          {saving ? "Saving…" : "Save Profile"}
        </button>
      </form>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6 mb-6" data-testid="public-url-card">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Share your profile</h2>
        <div className="flex flex-wrap items-center gap-2">
          <code data-testid="public-profile-url" className="flex-1 min-w-0 truncate text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-600">{publicUrl}</code>
          <button data-testid="btn-copy-profile-url" onClick={copyUrl}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors">
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
          {form.is_public && isPaid && (
            <a href={publicUrl} target="_blank" rel="noreferrer" data-testid="btn-view-public-profile"
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2.5 rounded-lg hover:bg-blue-100 transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> View
            </a>
          )}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6" data-testid="portfolio-section">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-slate-900">Portfolio</h2>
          <span className="text-xs text-slate-400" data-testid="portfolio-count">{portfolio.length}/{maxImages} images</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">Show off your best work — up to {maxImages} images with captions.</p>
        {!isPaid ? (
          <div className="flex items-center gap-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl p-5" data-testid="portfolio-locked">
            <Lock className="w-5 h-5 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">Portfolio is a Full Mode feature — upgrade to showcase your work.</p>
          </div>
        ) : (
          <>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" data-testid="input-portfolio-file" onChange={uploadPortfolio} />
            <button data-testid="btn-add-portfolio" onClick={() => fileRef.current?.click()} disabled={portfolio.length >= maxImages}
              className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg hover:bg-blue-100 disabled:opacity-40 transition-colors">
              <Upload className="w-4 h-4" /> Add Image
            </button>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="portfolio-grid">
              {portfolio.map((p, i) => (
                <div key={p.id} data-testid={`portfolio-item-${i}`} className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                  <img src={imgUrl(p.file_path)} alt={p.caption || "Portfolio"} className="object-cover w-full h-28" />
                  <div className="p-2">
                    <input data-testid={`portfolio-caption-${i}`} defaultValue={p.caption} placeholder="Caption…" maxLength={200}
                      onBlur={(e) => e.target.value !== p.caption && saveCaption(p.id, e.target.value)}
                      className="w-full text-xs rounded border border-slate-200 px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button title="Move up" data-testid={`portfolio-up-${i}`} onClick={() => move(i, -1)}
                      className="bg-white/90 rounded p-1 text-slate-600 hover:text-slate-900 shadow"><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button title="Move down" data-testid={`portfolio-down-${i}`} onClick={() => move(i, 1)}
                      className="bg-white/90 rounded p-1 text-slate-600 hover:text-slate-900 shadow"><ChevronDown className="w-3.5 h-3.5" /></button>
                    <button title="Delete" data-testid={`portfolio-delete-${i}`} onClick={() => removeImage(p.id)}
                      className="bg-white/90 rounded p-1 text-red-500 hover:text-red-700 shadow"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
