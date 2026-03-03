import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    // Proxy WebSocket vers le container edge-tts-proxy en dev
    proxy: {
      '/tts-proxy': {
        target: 'ws://edge-tts-proxy:3001',
        ws: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          'pdf-worker': ['pdfjs-dist'],
          'doc-parsers': ['mammoth', 'epubjs'],
        }
      }
    }
  }
})
