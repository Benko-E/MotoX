import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: {
    port: 5174, // Idle-Survivor uses 5173, so both can run at once
    strictPort: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000, // Three.js is big, and that's fine
  },
})
