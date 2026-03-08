import { createPortal } from "react-dom";

export default function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  if (typeof document === "undefined") return null;

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-[92%] max-w-xl rounded-2xl border border-white/40 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.28)] backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg font-bold text-gray-900">{title}</div>

          <button
            className="text-gray-500 hover:text-gray-700 text-xl"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="mt-4">{children}</div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
