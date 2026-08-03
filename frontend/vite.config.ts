import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Pin the dev server: start_dev.sh, the README and getting-started.md all
    // point people at :5173. Without strictPort Vite quietly moves to 5174 when
    // a stale dev server is still running, which looks like a broken app rather
    // than "something else is already running".
    port: 5173,
    strictPort: true,
  },
})
