import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../services/api";

export default function Login() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");

      const res = await api.post("/auth/login", { username, password });
      const { token, user } = res.data;

      localStorage.setItem("token", token);
      localStorage.setItem("role", user.role);
      localStorage.setItem("farmId", user.farm_id || "");
      localStorage.setItem("user", JSON.stringify(user));

      // ✅ admin ยังไม่บังคับต้องมี admin_farmId ทันที (ไปเลือกใน dashboard ก็ได้)
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
          className="relative w-full max-w-md space-y-4 rounded-3xl border border-white/25 bg-white/12 p-6 text-slate-100 shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-7"
        >
          <div className="space-y-1 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight">SmartFarm</h1>
            <p className="text-sm text-slate-200/90">เข้าสู่ระบบควบคุมฟาร์มอัจฉริยะ</p>
          </div>

          {error && <div className="rounded-xl border border-red-300/40 bg-red-500/15 p-3 text-sm text-red-100">{error}</div>}

          <input
            className="w-full rounded-xl border border-white/25 bg-slate-900/45 px-3 py-2.5 text-white outline-none ring-cyan-300/50 placeholder:text-slate-300/80 focus:ring-2"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <input
            className="w-full rounded-xl border border-white/25 bg-slate-900/45 px-3 py-2.5 text-white outline-none ring-cyan-300/50 placeholder:text-slate-300/80 focus:ring-2"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 py-2.5 font-semibold text-slate-900 shadow-[0_12px_30px_rgba(16,185,129,0.45)] transition hover:brightness-110 disabled:opacity-70"
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          <div className="text-center text-sm text-slate-200">
            ยังไม่มีบัญชี?{" "}
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
