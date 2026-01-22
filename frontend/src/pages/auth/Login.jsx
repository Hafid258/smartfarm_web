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
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <form onSubmit={onSubmit} className="bg-white w-full max-w-md p-6 rounded-2xl shadow space-y-4">
        <h1 className="text-2xl font-bold text-center">SmartFarm Login</h1>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded">{error}</div>}

        <input
          className="w-full border rounded-lg px-3 py-2"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          className="w-full border rounded-lg px-3 py-2"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg">
          {loading ? "Logging in..." : "Login"}
        </button>

        <div className="text-sm text-center text-gray-600">
          ยังไม่มีบัญชี? <Link to="/register" className="text-green-700 font-semibold">Register</Link>
        </div>
      </form>
    </div>
  );
}
