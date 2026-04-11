import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxy = {
  '/api': {
    target: 'http://localhost:8086',
    changeOrigin: true,
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq, req) => {
        const a = req.headers.authorization
        if (a) proxyReq.setHeader('Authorization', a)
      })
    },
  },
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,  // Fail if 5173 is busy (no auto-increment)
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
})
