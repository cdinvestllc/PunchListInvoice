import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errMsg } from "@/api";
import { AuthShell } from "./Login";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Missing verification token.");
      return;
    }
    api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => setState("ok"))
      .catch((e) => { setState("error"); setMessage(errMsg(e)); });
  }, [token]);

  return (
    <AuthShell title="Email verification" testid="verify-email-page">
      {state === "loading" && <p className="text-sm text-slate-500" data-testid="verify-loading">Verifying…</p>}
      {state === "ok" && (
        <div data-testid="verify-success" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-3">
          Your email has been verified.
        </div>
      )}
      {state === "error" && (
        <div data-testid="verify-error" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{message}</div>
      )}
      <p className="text-sm text-center mt-4">
        <Link to="/dashboard" data-testid="link-goto-dashboard" className="text-blue-600 hover:text-blue-800 font-medium">
          Go to dashboard
        </Link>
      </p>
    </AuthShell>
  );
}
