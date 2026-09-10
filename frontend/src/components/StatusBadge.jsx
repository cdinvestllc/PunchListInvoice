const STYLES = {
  draft: "bg-slate-100 text-slate-600 border-slate-300",
  new: "bg-blue-50 text-blue-700 border-blue-300",
  sent: "bg-sky-50 text-sky-700 border-sky-300",
  contacted: "bg-violet-50 text-violet-700 border-violet-200",
  scheduled: "bg-amber-50 text-amber-700 border-amber-200",
  quoted: "bg-sky-50 text-sky-700 border-sky-300",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-300",
  paid: "bg-emerald-100 text-emerald-800 border-emerald-300",
  declined: "bg-red-50 text-red-700 border-red-300",
  overdue: "bg-rose-50 text-rose-700 border-rose-300",
  completed: "bg-green-50 text-green-700 border-green-300",
  active: "bg-emerald-50 text-emerald-700 border-emerald-300",
  suspended: "bg-red-50 text-red-700 border-red-300",
  canceled: "bg-slate-100 text-slate-600 border-slate-300",
  free: "bg-slate-100 text-slate-600 border-slate-300",
  pro: "bg-blue-50 text-blue-700 border-blue-300",
  admin: "bg-violet-50 text-violet-700 border-violet-300",
  customer: "bg-slate-100 text-slate-600 border-slate-300",
};

export default function StatusBadge({ status, testid }) {
  const cls = STYLES[status] || STYLES.draft;
  return (
    <span data-testid={testid || `badge-${status}`}
      className={`inline-flex items-center text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${cls}`}>
      {status}
    </span>
  );
}
