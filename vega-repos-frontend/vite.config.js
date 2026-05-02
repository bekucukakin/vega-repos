import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const proxyHeaders = (proxy) => {
  proxy.on('proxyReq', (proxyReq, req) => {
    const a = req.headers.authorization
    if (a) proxyReq.setHeader('Authorization', a)
  })
}

const serverProxy = {
  // Agent service must come before /api so it matches first
  '/api/agent': {
    target: 'http://localhost:8084',
    changeOrigin: true,
    configure: proxyHeaders,
  },
  '/api': {
    target: 'http://localhost:8086',
    changeOrigin: true,
    configure: proxyHeaders,
  },
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: serverProxy,
  },
  preview: {
    proxy: serverProxy,
  },
})
