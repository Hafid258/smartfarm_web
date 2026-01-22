import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/auth/Login.jsx";
import Register from "./pages/auth/Register.jsx";
import AdminRoutes from "./routes/AdminRoutes.jsx";
import UserRoutes from "./routes/UserRoutes.jsx";

function RequireAuth({ children, role }) {
  const token = localStorage.getItem("token");
  const userRole = localStorage.getItem("role");
  if (!token || token === "undefined") return <Navigate to="/login" />;
  if (role && userRole !== role) return <Navigate to="/login" />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/admin/*" element={<RequireAuth role="admin"><AdminRoutes/></RequireAuth>} />
      <Route path="/user/*" element={<RequireAuth role="user"><UserRoutes/></RequireAuth>} />

      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}
