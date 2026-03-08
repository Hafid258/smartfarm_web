import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";

export default function Register() {
  const [form, setForm] = useState({ username: "", password: "", email: "", phone: "" });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");
      setMsg("");
      const res = await api.post("/auth/register", form);
      setMsg(res.data.message || "สมัครสำเร็จ");
      setForm({ username: "", password: "", email: "", phone: "" });
    } catch (err) {
      setError(err?.response?.data?.error || "Register failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-8 sm:py-12">
      <div className="pointer-events-none absolute -top-16 -left-16 h-56 w-56 rounded-full bg-cyan-400/30 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-10 h-72 w-72 rounded-full bg-emerald-400/25 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-blue-500/20 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <form
          onSubmit={submit}
          className="relative w-full max-w-md space-y-4 rounded-3xl border border-white/25 bg-white/12 p-6 text-slate-100 shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-7"
        >
          <div className="space-y-1 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight">Register</h1>
            <p className="text-sm text-slate-200/90">สร้างบัญชีเพื่อใช้งานระบบ SmartFarm</p>
          </div>

          {msg && (
            <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/15 p-3 text-sm text-emerald-100">
              {msg}
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-red-300/40 bg-red-500/15 p-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <input
            className="w-full rounded-xl border border-white/25 bg-slate-900/45 px-3 py-2.5 text-white outline-none ring-cyan-300/50 placeholder:text-slate-300/80 focus:ring-2"
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />

          <input
            className="w-full rounded-xl border border-white/25 bg-slate-900/45 px-3 py-2.5 text-white outline-none ring-cyan-300/50 placeholder:text-slate-300/80 focus:ring-2"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />

          <input
            className="w-full rounded-xl border border-white/25 bg-slate-900/45 px-3 py-2.5 text-white outline-none ring-cyan-300/50 placeholder:text-slate-300/80 focus:ring-2"
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />

          <input
            className="w-full rounded-xl border border-white/25 bg-slate-900/45 px-3 py-2.5 text-white outline-none ring-cyan-300/50 placeholder:text-slate-300/80 focus:ring-2"
            placeholder="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />

          <button
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 py-2.5 font-semibold text-slate-900 shadow-[0_12px_30px_rgba(16,185,129,0.45)] transition hover:brightness-110 disabled:opacity-70"
          >
            {loading ? "Submitting..." : "Register"}
          </button>

          <div className="text-center text-sm text-slate-200">
            มีบัญชีแล้ว?{" "}
            <Link to="/login" className="font-semibold text-cyan-300 hover:text-cyan-200">
              Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
