import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, '..'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
      '/media': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.VITE_WS_PROXY_TARGET || 'ws://localhost:8001',
        ws: true,
      }
    }
  }
})
