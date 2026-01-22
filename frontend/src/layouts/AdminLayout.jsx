import { NavLink, Outlet, useNavigate } from "react-router-dom";
import Button from "../components/ui/Button.jsx";


function cx(...a) {
  return a.filter(Boolean).join(" ");
}

const links = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/farms", label: "Farms" },
  { to: "/admin/plants", label: "Plants" },
  { to: "/admin/settings", label: "Farm Settings" },
  { to: "/admin/notifications", label: "Notifications" },
  { to: "/admin/commands", label: "Commands Log" },
  { to: "/admin/device-status", label: "Device Status" },
  { to: "/admin/alert-rules", label: "ตั้งค่าการแจ้งเตือน" },


];

export default function AdminLayout() {
  const nav = useNavigate();

  function logout() {
    localStorage.clear();
    nav("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Topbar */}
      <div className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-gray-900" />
            <div>
              <div className="font-bold text-gray-900 leading-tight">SmartFarm</div>
              <div className="text-xs text-gray-500">Admin Console</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={logout}>Logout</Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-[72px] h-fit">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold text-gray-500 mb-3">ADMIN MENU</div>
            <nav className="space-y-1">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    cx(
                      "block rounded-xl px-3 py-2 text-sm transition",
                      isActive
                        ? "bg-gray-900 text-white font-semibold"
                        : "text-gray-700 hover:bg-gray-50 border border-transparent"
                    )
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>

            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">Reminder</div>
              <div className="text-sm text-gray-700 mt-1">
                Admin สามารถเลือกฟาร์มจากหน้าแต่ละเมนูได้ (ถ้า backend อนุญาต override farm)
              </div>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
