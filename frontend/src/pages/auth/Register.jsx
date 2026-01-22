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
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <form onSubmit={submit} className="bg-white w-full max-w-md p-6 rounded-2xl shadow space-y-4">
        <h1 className="text-2xl font-bold text-center">Register</h1>

        {msg && (
          <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded">
            ✅ {msg}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded">
            ❌ {error}
          </div>
        )}

        <input
          className="w-full border rounded-lg px-3 py-2"
          placeholder="Username"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          required
        />

        <input
          className="w-full border rounded-lg px-3 py-2"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />

        <input
          className="w-full border rounded-lg px-3 py-2"
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />

        <input
          className="w-full border rounded-lg px-3 py-2"
          placeholder="Password"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />

        <button
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg disabled:opacity-60"
        >
          {loading ? "Submitting..." : "Register"}
        </button>

        <div className="text-sm text-center text-gray-600">
          มีบัญชีแล้ว?{" "}
          <Link to="/login" className="text-green-700 font-semibold">
            Login
          </Link>
        </div>
      </form>
    </div>
  );
}
