export default function Input({ className="", ...props }) {
  return (
    <input
      className={`w-full rounded-xl border border-slate-300/80 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200 ${className}`}
      {...props}
    />
  );
}
