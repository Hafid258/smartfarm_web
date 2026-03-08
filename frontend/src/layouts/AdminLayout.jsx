import { NavLink, Outlet, useNavigate } from "react-router-dom";
import Button from "../components/ui/Button.jsx";


function cx(...a) {
  return a.filter(Boolean).join(" ");
}

const links = [
  { to: "/admin/dashboard", label: "ภาพรวมระบบ" },
  { to: "/admin/users", label: "ผู้ใช้งาน" },
  { to: "/admin/farms", label: "ฟาร์ม" },
  { to: "/admin/plants", label: "พืช/แปลง" },
  { to: "/admin/settings", label: "ตั้งค่าฟาร์ม" },
  { to: "/admin/notifications", label: "การแจ้งเตือน" },
  { to: "/admin/commands", label: "ควบคุมปั้มน้ำ" },
  { to: "/admin/device-status", label: "สถานะอุปกรณ์" },
  { to: "/admin/alert-rules", label: "กฎการแจ้งเตือน" },
];

export default function AdminLayout() {
  const nav = useNavigate();

  function logout() {
    localStorage.clear();
    nav("/login", { replace: true });
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-transparent">
      <div className="pointer-events-none absolute -top-20 -left-20 h-64 w-64 rounded-full bg-cyan-300/25 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-24 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
      {/* Topbar */}
      <div className="sticky top-0 z-40 border-b border-white/60 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-cyan-500 to-slate-900 shadow-[0_10px_24px_rgba(14,116,144,0.35)]" />
            <div>
              <div className="font-bold text-gray-900 leading-tight">SmartFarm</div>
              <div className="text-xs text-gray-500">โหมดผู้ดูแลระบบ</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={logout}>ออกจากระบบ</Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-[72px] h-fit">
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.1)] backdrop-blur-sm">
            <div className="text-xs font-semibold text-gray-500 mb-3">เมนูผู้ดูแล</div>
            <nav className="space-y-1">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    cx(
                      "block rounded-xl px-3 py-2 text-sm transition",
                      isActive
                        ? "bg-gradient-to-r from-slate-800 to-slate-900 text-white font-semibold shadow-[0_8px_20px_rgba(15,23,42,0.35)]"
                        : "text-gray-700 hover:bg-white border border-transparent"
                    )
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>

            <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
              <div className="text-sm font-semibold text-gray-900">หมายเหตุ</div>
              <div className="text-sm text-gray-700 mt-1">
                ผู้ดูแลสามารถเลือกฟาร์มจากแต่ละหน้าได้ หากระบบหลังบ้านเปิดสิทธิให้เปลี่ยนฟาร์ม
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
