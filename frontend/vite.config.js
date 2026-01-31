import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: ['semicrystalline-quirkily-sharolyn.ngrok-free.dev'],
    strictPort: true,
    // ถ้าต้องการใช้ HMR ผ่าน tunnel ให้ตั้ง env:
    // VITE_HMR_HOST=your-domain.trycloudflare.com
    // VITE_HMR_PROTOCOL=wss
    // VITE_HMR_CLIENT_PORT=443
    hmr: process.env.VITE_HMR_HOST
      ? {
          protocol: process.env.VITE_HMR_PROTOCOL || 'wss',
          host: process.env.VITE_HMR_HOST,
          clientPort: Number(process.env.VITE_HMR_CLIENT_PORT || 443),
        }
      : undefined
  }
})
