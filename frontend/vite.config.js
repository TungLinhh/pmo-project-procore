import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    // Allow Cloudflare Tunnel quick tunnel domains (trycloudflare.com)
    // Plus localhost and common LAN hosts
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.trycloudflare.com',
      '.ngrok.io',
      '.ngrok-free.app',
      '10.255.255.254',
      '172.22.213.241',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
