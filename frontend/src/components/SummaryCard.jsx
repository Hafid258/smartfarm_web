import Card from "./ui/Card.jsx";

export default function SummaryCard({
  title,
  value,
  hint,
  status = "normal", // normal | good | warning | danger
  onClick,
}) {
  const statusText =
    status === "good"
      ? "ดี"
      : status === "warning"
      ? "ควรระวัง"
      : status === "danger"
      ? "อันตราย"
      : "ปกติ";

  const statusStyle =
    status === "good"
      ? "border-green-200 bg-gradient-to-br from-green-50 to-green-100/80"
      : status === "warning"
      ? "border-yellow-200 bg-gradient-to-br from-yellow-50 to-yellow-100/80"
      : status === "danger"
      ? "border-red-200 bg-gradient-to-br from-red-50 to-red-100/80"
      : "border-gray-200 bg-gradient-to-br from-white to-gray-50";

  const badgeStyle =
    status === "good"
      ? "bg-green-100 text-green-800 border-green-200"
      : status === "warning"
      ? "bg-yellow-100 text-yellow-800 border-yellow-200"
      : status === "danger"
      ? "bg-red-100 text-red-800 border-red-200"
      : "bg-gray-100 text-gray-700 border-gray-200";

  const accentStyle =
    status === "good"
      ? "bg-green-500"
      : status === "warning"
      ? "bg-yellow-500"
      : status === "danger"
      ? "bg-red-500"
      : "bg-gray-300";

  return (
    <Card
      className={`relative overflow-hidden p-4 rounded-2xl border transition duration-200 hover:shadow-md hover:-translate-y-0.5 ${onClick ? "cursor-pointer" : "cursor-default"} ${statusStyle}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      title={onClick ? "คลิกเพื่อดูคำอธิบาย" : undefined}
    >
      <div className={`absolute left-0 top-0 h-full w-1.5 ${accentStyle}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-gray-800 pl-1">{title}</div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${badgeStyle}`}>
            {statusText}
          </span>
          {onClick ? <span className="text-xs text-gray-400 select-none">ℹ️</span> : null}
        </div>
      </div>

      <div className="mt-2 text-2xl font-bold text-gray-900">{value}</div>

      {hint ? (
        <div className="mt-2 text-xs text-gray-500 line-clamp-2">{hint}</div>
      ) : null}
    </Card>
  );
}
