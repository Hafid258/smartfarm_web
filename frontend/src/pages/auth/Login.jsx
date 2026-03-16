import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../services/api";

const ROLE_OPTIONS = [
  {
    value: "user",
    title: "ผู้ใช้งาน",
    subtitle: "User",
    accent: "from-cyan-400 to-sky-500",
    glow: "shadow-[0_18px_40px_rgba(34,211,238,0.18)]",
    badge: "bg-cyan-500/15 text-cyan-100 border-cyan-200/30",
    icon: "○",
  },
  {
    value: "admin",
    title: "ผู้ดูแลระบบ",
    subtitle: "Admin",
    accent: "from-amber-300 to-orange-400",
    glow: "shadow-[0_18px_40px_rgba(251,191,36,0.2)]",
    badge: "bg-amber-500/15 text-amber-50 border-amber-200/40",
    icon: "★",
  },
];

function roleMismatchMessage(selectedRole, actualRole) {
  if (selectedRole === actualRole) return "";
  if (selectedRole === "admin") return "บัญชีนี้ไม่ได้เป็นผู้ดูแลระบบ";
  return "บัญชีนี้ไม่ได้เป็นผู้ใช้งานทั่วไป";
}

export default function Login() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginRole, setLoginRole] = useState("user");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");

      const res = await api.post("/auth/login", { username, password });
      const { token, user } = res.data;
      const mismatch = roleMismatchMessage(loginRole, user?.role);
      if (mismatch) {
        setError(mismatch);
        return;
      }

      localStorage.setItem("token", token);
      localStorage.setItem("role", user.role);
      localStorage.setItem("farmId", user.farm_id || "");
      localStorage.setItem("user", JSON.stringify(user));

      if (user.role === "admin") nav("/admin/dashboard");
      else nav("/user/dashboard");
    } catch (err) {
      setError(err?.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-8 sm:py-12">
      <div className="pointer-events-none absolute -top-16 -left-16 h-56 w-56 rounded-full bg-cyan-400/35 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-10 h-72 w-72 rounded-full bg-emerald-400/25 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-blue-500/20 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <div className="pointer-events-none absolute inset-0 hidden sm:block">
          <div className="absolute left-[10%] top-[15%] h-28 w-28 rounded-2xl border border-white/20 bg-white/5 shadow-[0_22px_60px_rgba(0,0,0,0.35)] backdrop-blur-md [transform:rotate(-14deg)_translateZ(0)]" />
          <div className="absolute right-[12%] bottom-[18%] h-24 w-24 rounded-full border border-cyan-200/40 bg-cyan-200/15 shadow-[0_16px_45px_rgba(34,211,238,0.35)]" />
        </div>

        <form
          onSubmit={onSubmit}
          className="relative w-full max-w-lg space-y-5 rounded-[2rem] border border-white/20 bg-white/12 p-6 text-slate-100 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-8"
        >
          <div className="space-y-1 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight">SmartFarm</h1>
            <p className="text-sm text-slate-200/90">เข้าสู่ระบบและเลือกสิทธิ์การใช้งานก่อนเริ่มทำงาน</p>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium text-slate-100">เลือกระดับการเข้าสู่ระบบ</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {ROLE_OPTIONS.map((option) => {
                const active = loginRole === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLoginRole(option.value)}
                    className={[
                      "group relative overflow-hidden rounded-3xl border p-4 text-left transition duration-200",
                      active
                        ? `border-white/50 bg-white/18 ${option.glow} ring-2 ring-white/25`
                        : "border-white/15 bg-slate-900/35 hover:border-white/30 hover:bg-white/10",
                    ].join(" ")}
                  >
                    <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${option.accent} ${active ? "opacity-100" : "opacity-0 group-hover:opacity-70"}`} />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/12 text-lg font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
                          {option.icon}
                        </div>
                        <div className="text-lg font-semibold text-white">{option.title}</div>
                        <div className="text-sm text-slate-300">{option.subtitle}</div>
                      </div>
                      <span
                        className={[
                          "rounded-full border px-2.5 py-1 text-xs font-semibold",
                          active ? option.badge : "border-white/15 bg-white/8 text-slate-200",
                        ].join(" ")}
                      >
                        {active ? "เลือกอยู่" : "เลือก"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-300/40 bg-red-500/15 p-3 text-sm text-red-100">{error}</div>
          ) : null}

          <div className="space-y-3">
            <input
              className="w-full rounded-2xl border border-white/20 bg-slate-900/45 px-4 py-3 text-white outline-none ring-cyan-300/50 placeholder:text-slate-300/80 focus:ring-2"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />

            <input
              className="w-full rounded-2xl border border-white/20 bg-slate-900/45 px-4 py-3 text-white outline-none ring-cyan-300/50 placeholder:text-slate-300/80 focus:ring-2"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            disabled={loading}
            className="w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 py-3 font-semibold text-slate-950 shadow-[0_16px_34px_rgba(16,185,129,0.4)] transition hover:brightness-110 disabled:opacity-70"
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : loginRole === "admin" ? "เข้าสู่ระบบผู้ดูแล" : "เข้าสู่ระบบผู้ใช้งาน"}
          </button>

          <div className="text-center text-sm text-slate-200">
            ยังไม่มีบัญชี? {" "}
            <Link to="/register" className="font-semibold text-cyan-300 hover:text-cyan-200">
              Register
            </Link>
          </div>
          <div className="pointer-events-none absolute -inset-x-5 -bottom-5 -z-10 h-16 rounded-full bg-cyan-400/25 blur-2xl" />
        </form>
      </div>
    </div>
  );
}
