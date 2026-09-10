import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { api, errMsg } from "@/api";
import { AuthShell, authInputCls, authLabelCls } from "./Login";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      navigate("/login");
    } catch (e2) {
      setError(errMsg(e2));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Choose a new password" testid="reset-password-page">
      {!token ? (
        <div data-testid="reset-no-token" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Missing reset token. Use the link from your email.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" data-testid="reset-form">
          {error && <div data-testid="reset-error" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className={authLabelCls} htmlFor="reset-password">New Password</label>
            <input id="reset-password" data-testid="reset-new-password" type="password" required minLength={8}
              className={authInputCls} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 chars, letters + numbers" />
          </div>
          <button type="submit" data-testid="reset-submit-button" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50 transition-colors">
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
      <p className="text-sm text-center mt-4">
        <Link to="/login" className="text-blue-600 hover:text-blue-800 font-medium">Back to login</Link>
      </p>
    </AuthShell>
  );
}
