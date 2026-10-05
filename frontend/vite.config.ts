import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Production: build patenka tiesiai į Laravel public/app (teikia web.php)
  base: '/app/',
  build: {
    outDir: '../backend/public/app',
    emptyOutDir: true,
  },
})
