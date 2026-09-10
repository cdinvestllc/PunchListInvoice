import { useState } from "react";
import { Link } from "react-router-dom";
import { api, errMsg } from "@/api";
import { AuthShell, authInputCls, authLabelCls } from "./Login";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setDone(true);
    } catch (e2) {
      setError(errMsg(e2));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a secure reset link (mocked to server logs in this demo)." testid="forgot-password-page">
      {done ? (
        <div data-testid="forgot-success" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-3">
          If that email exists, a reset link has been sent. In this demo, the link appears in the backend logs as [MOCK EMAIL].
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" data-testid="forgot-form">
          {error && <div data-testid="forgot-error" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className={authLabelCls} htmlFor="forgot-email">Email</label>
            <input id="forgot-email" data-testid="forgot-email" type="email" required className={authInputCls}
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
          </div>
          <button type="submit" data-testid="forgot-submit-button" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors">
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <p className="text-sm text-center mt-4">
        <Link to="/login" data-testid="link-back-login" className="text-blue-600 hover:text-blue-800 font-medium">Back to login</Link>
      </p>
    </AuthShell>
  );
}
