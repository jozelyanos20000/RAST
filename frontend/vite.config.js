import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        // Rewrite Set-Cookie domain so the browser accepts cookies
        // served via the dev proxy on localhost:5173
        cookieDomainRewrite: { 'localhost:5000': 'localhost' },
      },
      '/static': 'http://localhost:5000',
    }
  }
})
