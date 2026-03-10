import { useEffect, useMemo, useRef, useState } from "react";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseTime(value) {
  if (!value || typeof value !== "string") return { hh: 0, mm: 0 };
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return { hh: 0, mm: 0 };
  return { hh: Math.max(0, Math.min(23, h)), mm: Math.max(0, Math.min(59, m)) };
}

function to12Hour(hh24) {
  const ampm = hh24 >= 12 ? "PM" : "AM";
  const h = hh24 % 12 || 12;
  return { h, ampm };
}

function to24Hour(hh12, ampm) {
  if (ampm === "AM") return hh12 === 12 ? 0 : hh12;
  return hh12 === 12 ? 12 : hh12 + 12;
}

export default function ClockTimePicker({ label, value, onChange }) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("hour");

  const parsed = useMemo(() => parseTime(value), [value]);
  const hour12 = to12Hour(parsed.hh);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev) => {
      if (!rootRef.current?.contains(ev.target)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const setHour12 = (selected12) => {
    const hh = to24Hour(selected12, hour12.ampm);
    onChange?.(`${pad2(hh)}:${pad2(parsed.mm)}`);
    setStep("minute");
  };

  const setMinute = (selectedMinute) => {
    onChange?.(`${pad2(parsed.hh)}:${pad2(selectedMinute)}`);
  };

  const setAmPm = (ampm) => {
    const hh = to24Hour(hour12.h, ampm);
    onChange?.(`${pad2(hh)}:${pad2(parsed.mm)}`);
  };

  const dialValues =
    step === "hour"
      ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const selectedForDial = step === "hour" ? hour12.h : Math.round(parsed.mm / 5) * 5;

  return (
    <div ref={rootRef} className="relative">
      <div className="mb-1 text-xs text-slate-600">{label}</div>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setStep("hour");
        }}
        className="w-[170px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm shadow-[0_6px_14px_rgba(15,23,42,0.08)] hover:bg-slate-50"
      >
        {value || "--:--"}
      </button>

      {open ? (
        <div className="absolute z-50 mt-2 w-[280px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_20px_40px_rgba(15,23,42,0.2)]">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">{label}</div>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
              onClick={() => setOpen(false)}
            >
              ปิด
            </button>
          </div>

          <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-center text-lg font-bold text-slate-900">
            {pad2(parsed.hh)}:{pad2(parsed.mm)}
          </div>

          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setStep("hour")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                step === "hour" ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              ชั่วโมง
            </button>
            <button
              type="button"
              onClick={() => setStep("minute")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                step === "minute" ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              นาที
            </button>
            <div className="ml-auto flex gap-1">
              <button
                type="button"
                onClick={() => setAmPm("AM")}
                className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${
                  hour12.ampm === "AM" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => setAmPm("PM")}
                className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${
                  hour12.ampm === "PM" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                PM
              </button>
            </div>
          </div>

          <div className="relative mx-auto h-[220px] w-[220px] rounded-full border border-slate-200 bg-gradient-to-b from-slate-50 to-white">
            <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-500" />
            {dialValues.map((n, idx) => {
              const angle = (idx / 12) * Math.PI * 2 - Math.PI / 2;
              const radius = 88;
              const x = 110 + Math.cos(angle) * radius;
              const y = 110 + Math.sin(angle) * radius;
              const active = selectedForDial === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => (step === "hour" ? setHour12(n) : setMinute(n))}
                  className={`absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full text-xs font-semibold transition ${
                    active
                      ? "bg-cyan-600 text-white shadow-[0_8px_18px_rgba(8,145,178,0.35)]"
                      : "bg-white text-slate-700 border border-slate-200 hover:bg-cyan-50"
                  }`}
                  style={{ left: `${x}px`, top: `${y}px` }}
                >
                  {step === "minute" ? pad2(n) : n}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
