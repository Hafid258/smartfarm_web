export default function Card({ children, className = "", ...props }) {
  return (
    <div
      className={`rounded-2xl border border-white/70 bg-white/85 shadow-[0_14px_40px_rgba(15,23,42,0.08)] backdrop-blur-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
