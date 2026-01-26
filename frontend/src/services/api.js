// frontend/src/services/api.js
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api",
  timeout: 15000,
});

function isValidObjectIdString(v) {
  // 24 hex chars
  return typeof v === "string" && /^[a-fA-F0-9]{24}$/.test(v.trim());
}

api.interceptors.request.use(
  (config) => {
    // 1) auth
    const token = localStorage.getItem("token");
    if (token && token !== "undefined") {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // 2) ngrok (ถ้า baseURL เป็น ngrok ค่อยใส่ header นี้)
    const base = String(config.baseURL || "");
    if (base.includes("ngrok-free.dev")) {
      config.headers["ngrok-skip-browser-warning"] = "1";
    }

    // 3) farm context (ส่งเป็น header เท่านั้น)
    //    - admin: ใช้ admin_farmId ถ้ามี (รองรับหน้า admin ที่เลือกฟาร์ม)
    //    - fallback: farmId ปกติ
    const adminFarmId = localStorage.getItem("admin_farmId");
    const farmId = localStorage.getItem("farmId");

    const selected =
      isValidObjectIdString(adminFarmId) ? adminFarmId.trim()
      : isValidObjectIdString(farmId) ? farmId.trim()
      : null;

    if (selected) {
      config.headers["x-farm-id"] = selected;
    } else {
      // กัน header ค้าง
      delete config.headers["x-farm-id"];
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;

    if (status === 401) {
      // token หมดอายุ/ไม่ถูกต้อง → logout
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("farmId");
      localStorage.removeItem("user");
      // ไม่ลบ admin_farmId เพื่อให้ admin เลือกฟาร์มเดิมไว้ได้
      window.location.href = "/login";
    }

    // ส่งข้อความ error ให้หน้าอื่นใช้ได้ง่ายขึ้น
    const msg =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      "Network Error";

    err.message = msg;
    return Promise.reject(err);
  }
);

export default api;
