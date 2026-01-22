import { Routes, Route, Navigate } from "react-router-dom";
import AdminLayout from "../layouts/AdminLayout.jsx";

import Dashboard from "../pages/admin/Dashboard.jsx";
import Users from "../pages/admin/Users.jsx";
import Farms from "../pages/admin/Farms.jsx";
import Plants from "../pages/admin/Plants.jsx";
import FarmSettings from "../pages/admin/FarmSettings.jsx";
import NotificationsMonitor from "../pages/admin/NotificationsMonitor.jsx";
import DeviceCommandsLog from "../pages/admin/DeviceCommandsLog.jsx";
import DeviceStatus from "../pages/admin/DeviceStatus.jsx";
import AlertRules from "../pages/admin/AlertRules.jsx";

export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />

        <Route path="dashboard" element={<Dashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="farms" element={<Farms />} />
        <Route path="plants" element={<Plants />} />
        <Route path="settings" element={<FarmSettings />} />
        <Route path="notifications" element={<NotificationsMonitor />} />
        <Route path="commands" element={<DeviceCommandsLog />} />
        <Route path="device-status" element={<DeviceStatus />} />
        <Route path="alert-rules" element={<AlertRules />} />
        

        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>
    </Routes>
  );
}
