# 🌱 SmartFarm Full‑Stack (Frontend + Backend)

โปรเจกต์นี้ประกอบด้วย
- **Backend**: Node.js + Express + MongoDB + JWT Auth
- **Frontend**: React + Vite + Tailwind + Recharts
- รองรับการรันได้ทั้งแบบ **Local (npm)** และแบบ **Docker Compose**

---

## 1) โครงสร้างโปรเจกต์

```
smartfarm_fullstack_v9/
  backend/
  frontend/
  docker-compose.yml
```

---

## 2) Run แบบ Docker (แนะนำ ✅)

> ต้องติดตั้ง Docker Desktop ก่อน

```bash
cd smartfarm_fullstack_v9
docker compose up -d --build
```

จากนั้นเปิดใช้งาน:
- Frontend: http://localhost:5173
- Backend:  http://localhost:3000
- MongoDB:  mongodb://localhost:27017

หยุดระบบ:
```bash
docker compose down
```

---

## 3) Run แบบ Local (npm)

### 3.1 Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

ค่าใน `.env` ที่จำเป็น:

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/smartfarm
JWT_SECRET=change-me
FRONTEND_URL=http://localhost:5173
```

### 3.2 Frontend

```bash
cd frontend
cp .env.example .env  # (ถ้ามี)
npm install
npm run dev
```

ตั้งค่า API URL (ถ้าต้องการ):

```env
VITE_API_URL=http://localhost:3000/api
```

---

## 4) API Health Check

```bash
curl http://localhost:3000/
```

ควรได้ผลลัพธ์ประมาณนี้:
```json
{ "ok": true, "name": "SmartFarm API v8", "time": "..." }
```

---

## 5) หมายเหตุสำคัญ

1. ในไฟล์ ZIP ที่คุณส่งมา มี `node_modules` ติดมาด้วย ซึ่งทำให้ไฟล์ใหญ่และอาจทำให้รันเพี้ยนได้
   - แนะนำให้ลบทิ้งและให้ `npm install` ใหม่ทุกครั้ง
2. ถ้าใช้ Docker Compose ระบบจะสร้าง MongoDB อัตโนมัติและตั้งค่า `MONGO_URI` ให้พร้อม
3. หากต้อง Deploy จริง แนะนำให้ปรับ
   - `FRONTEND_URL` ให้เป็นโดเมนจริง
   - `JWT_SECRET` ให้เป็นค่าแบบสุ่มที่ยาวและปลอดภัย

---

## 6) คำสั่งที่ใช้บ่อย

```bash
# backend
npm run dev

# frontend
npm run dev
npm run build
npm run preview
```
