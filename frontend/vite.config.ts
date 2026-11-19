import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Saugumo politika (CSP) tik produkciniam build'ui: leidžiami tik savi skriptai ir užklausos į savo API
 * (+ atsarginis lokalus API, jei nurodytas). Svetimi / įterpti skriptai nevykdomi.
 * Dev režime nededama (Vite HMR naudoja inline skriptus ir websocket).
 */
function csp(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const connect = ["'self'"]
  for (const url of [env.VITE_API_URL, env.VITE_LOCAL_API_URL]) {
    if (url && /^https?:\/\//.test(url)) connect.push(new URL(url).origin)
  }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  return {
    name: 'romnesa-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), csp(mode)],
  // Production: build patenka tiesiai į Laravel public/app (teikia web.php)
  base: '/app/',
  build: {
    outDir: '../backend/public/app',
    emptyOutDir: true,
  },
}))
