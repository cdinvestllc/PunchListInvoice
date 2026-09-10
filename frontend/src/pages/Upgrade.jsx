import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errMsg, fmt, fmtDate } from "@/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/components/ui/sonner";
import { Check, Zap } from "lucide-react";

export default function Upgrade() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [coupon, setCoupon] = useState("");
  const [discount, setDiscount] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = () => api.get("/subscription").then((r) => setInfo(r.data)).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { load(); }, []);

  const isPaid = info?.subscription?.plan === "pro" && ["active", "canceled"].includes(info?.subscription?.status);
  const price = info?.plan_price ?? 9.99;
  const finalPrice = discount ? discount.final_price : price;

  const applyCoupon = async () => {
    try {
      const { data } = await api.post("/coupons/validate", { code: coupon });
      setDiscount(data);
      toast.success(`Coupon ${data.code} applied.`);
    } catch (e) {
      setDiscount(null);
      toast.error(errMsg(e));
    }
  };

  const subscribe = async () => {
    setLoading(true);
    try {
      await api.post("/subscription/upgrade", { coupon_code: discount?.code || null });
      toast.success("Welcome to Full Mode! (Simulated checkout — no card charged)");
      await refresh();
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  const cancel = async () => {
    if (!window.confirm("Cancel your subscription? Full Mode stays active until the period ends.")) return;
    try {
      await api.post("/subscription/cancel");
      toast.success("Subscription canceled.");
      await refresh();
      await load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const features = info?.pro_features?.length ? info.pro_features : [
    "Unlimited estimates & invoices", "Logo & business branding", "No platform watermark",
    "Public pro profile & portfolio", "Customer estimate request inbox",
  ];

  return (
    <div data-testid="upgrade-page" className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
          {isPaid ? "You're on Full Mode" : "Upgrade to Quote Flow Full Mode"}
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          {isPaid
            ? info.subscription.status === "canceled"
              ? `Active until ${fmtDate(info.subscription.current_period_end)}.`
              : `Renews monthly. Next period ends ${fmtDate(info.subscription.current_period_end)}.`
            : "Unlimited quoting and invoicing for one simple monthly price. Cancel anytime."}
        </p>
      </div>

      <div className="bg-white rounded-2xl border-2 border-blue-600 shadow-lg p-6 sm:p-8" data-testid="plan-card">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-bold text-slate-900">Quote Flow Full Mode</h2>
        </div>
        <div className="flex items-baseline gap-1 mt-3">
          {discount && <span className="text-lg text-slate-400 line-through mr-1">{fmt(price)}</span>}
          <span className="text-4xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }} data-testid="plan-price">
            {fmt(finalPrice)}
          </span>
          <span className="text-slate-500 text-sm">/month</span>
        </div>
        <ul className="mt-6 space-y-2.5">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-2.5 text-sm text-slate-700">
              <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 text-emerald-700" />
              </span>
              {f}
            </li>
          ))}
        </ul>

        {!isPaid && (
          <>
            <div className="flex gap-2 mt-6">
              <input data-testid="input-coupon" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                placeholder="Coupon code (try WELCOME10)"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button data-testid="btn-apply-coupon" onClick={applyCoupon} disabled={!coupon.trim()}
                className="text-sm font-semibold text-slate-700 bg-white border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors">
                Apply
              </button>
            </div>
            <button data-testid="btn-subscribe" onClick={subscribe} disabled={loading}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-3 rounded-lg shadow-sm disabled:opacity-50 transition-colors">
              {loading ? "Processing…" : `Subscribe — ${fmt(finalPrice)}/month`}
            </button>
            <p className="text-xs text-slate-400 text-center mt-3">
              Simulated checkout for this deployment. Stripe can be enabled via server environment variables. No card data is ever stored.
            </p>
          </>
        )}
        {isPaid && info.subscription.status === "active" && (
          <button data-testid="btn-cancel-subscription" onClick={cancel}
            className="mt-6 w-full text-sm font-semibold text-red-700 bg-red-50 border border-red-200 py-2.5 rounded-lg hover:bg-red-100 transition-colors">
            Cancel subscription
          </button>
        )}
      </div>

      {!isPaid && (
        <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5 text-sm text-slate-600" data-testid="usage-summary">
          <p className="font-semibold text-slate-900 mb-2">Your Free Mode usage this month</p>
          <p>Estimates/quotes sent: <strong>{info?.usage?.quotes_sent ?? 0}</strong> / {info?.free_limits?.quotes ?? 3}</p>
          <p>Invoices sent: <strong>{info?.usage?.invoices_sent ?? 0}</strong> / {info?.free_limits?.invoices ?? 3}</p>
        </div>
      )}
    </div>
  );
}
