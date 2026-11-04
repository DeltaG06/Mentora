import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the API is proxied, so the app always calls /api/v1.
// In production set VITE_API_URL to the backend origin (e.g. https://api.example.com).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
