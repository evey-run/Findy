import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // ⬅️ Clé ici !
    port: 51737,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:36321',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://127.0.0.1:36321',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})