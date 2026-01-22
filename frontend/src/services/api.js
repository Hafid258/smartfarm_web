// frontend/src/services/api.js
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000/api",
  timeout: 15000,
});

// ✅ Request Interceptor: แนบ token + แนบ x-farm-id ให้ทั้ง admin และ user
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token && token !== "undefined") {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const role = localStorage.getItem("role");

    // ✅ farmId ของ user
    const userFarmId = localStorage.getItem("farmId");

    // ✅ farmId ที่ admin เลือก (ถ้ามี) ให้มี priority สูงกว่า
    const adminFarmId = localStorage.getItem("admin_farmId");

    const farmIdToUse =
      role === "admin"
        ? (adminFarmId && adminFarmId !== "undefined" ? adminFarmId : userFarmId)
        : userFarmId;

    if (farmIdToUse && farmIdToUse !== "undefined" && farmIdToUse !== "null") {
      config.headers["x-farm-id"] = farmIdToUse;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ Response Interceptor: ถ้า 401 -> logout
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;

    if (status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("farmId");
      localStorage.removeItem("user");

      // ไม่ลบ admin_farmId เผื่อ admin เลือกไว้แล้ว
      window.location.replace("/login");
      return;
    }

    const message = error?.response?.data?.error || error?.message || "Unknown error occurred";
    return Promise.reject({ ...error, message });
  }
);

export default api;
