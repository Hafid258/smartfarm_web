export default function Button({ variant="primary", className="", ...props }) {
  const base = "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px]";
  const styles = {
    primary: "bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-[0_10px_24px_rgba(16,185,129,0.35)] hover:brightness-110",
    secondary: "bg-gradient-to-r from-slate-800 to-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.35)] hover:brightness-110",
    outline: "border border-slate-300/80 bg-white/85 text-slate-800 shadow-[0_6px_14px_rgba(15,23,42,0.08)] hover:bg-white",
    danger: "bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-[0_10px_24px_rgba(239,68,68,0.35)] hover:brightness-110",
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}
