import Card from "./ui/Card.jsx";

export default function SummaryCard({
  title,
  value,
  hint,
  status = "normal", // normal | good | warning | danger
  onClick,
}) {
  const statusStyle =
    status === "good"
      ? "border-emerald-200 bg-emerald-50"
      : status === "warning"
      ? "border-amber-200 bg-amber-50"
      : status === "danger"
      ? "border-red-200 bg-red-50"
      : "border-gray-200 bg-white";

  const valueStyle =
    status === "good"
      ? "text-emerald-700"
      : status === "warning"
      ? "text-amber-700"
      : status === "danger"
      ? "text-red-700"
      : "text-gray-900";

  return (
    <Card
      className={`p-4 rounded-2xl border transition cursor-pointer hover:shadow-sm ${statusStyle}`}
      onClick={onClick}
      role="button"
      title="คลิกเพื่อดูคำอธิบาย"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-gray-800">{title}</div>
        <div className="text-xs text-gray-400 select-none">ℹ️</div>
      </div>

      <div className={`mt-2 text-2xl font-bold ${valueStyle}`}>{value}</div>

      {hint ? (
        <div className="mt-2 text-xs text-gray-500 line-clamp-2">{hint}</div>
      ) : null}
    </Card>
  );
}
