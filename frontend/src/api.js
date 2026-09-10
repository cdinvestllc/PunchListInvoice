import axios from "axios";

export const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API_URL, withCredentials: true });

export function errMsg(e, fallback = "Something went wrong. Please try again.") {
  const d = e?.response?.data?.detail;
  if (d == null) return fallback;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => (x && typeof x.msg === "string" ? x.msg : JSON.stringify(x))).filter(Boolean).join(" ");
  if (d && typeof d.msg === "string") return d.msg;
  return String(d);
}

export const fmt = (n) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtDate = (s) => {
  if (!s) return "—";
  try {
    return new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return s;
  }
};

export const imgUrl = (path) => {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${API_URL}/files/${path}`;
};

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined"];
export const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue"];
export const REQUEST_STATUSES = ["new", "contacted", "scheduled", "quoted", "accepted", "declined", "completed"];
