import { Routes, Route, Navigate } from "react-router-dom";
import UserLayout from "../layouts/UserLayout.jsx";

import Dashboard from "../pages/user/Dashboard.jsx";
import Notifications from "../pages/user/Notifications.jsx";
import ControlPump from "../pages/user/ControlPump.jsx";
import Settings from "../pages/user/Settings.jsx";
import Profile from "../pages/user/Profile.jsx";
import DeviceStatus from "../pages/user/DeviceStatus.jsx";

export default function UserRoutes() {
  return (
    <Routes>
      {/* ✅ ใส่ path="/" + index route เพื่อให้ match /user/* ได้ชัวร์ */}
      <Route path="/" element={<UserLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />

        <Route path="dashboard" element={<Dashboard />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="control" element={<ControlPump />} />
        <Route path="device-status" element={<DeviceStatus />} />
        <Route path="settings" element={<Settings />} />
        <Route path="profile" element={<Profile />} />

        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>
    </Routes>
  );
}
