export default function Input({ className="", ...props }) {
  return (
    <input
      className={`w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200 ${className}`}
      {...props}
    />
  );
}
