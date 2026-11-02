import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: {
    port: 5174, // Idle-Survivor uses 5173, so both can run at once
    strictPort: true,
  },
  build: {
    // GitHub Pages serves docs/ from main; it's wiped on every build, so nothing else may live in it
    outDir: 'docs',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 2000, // Three.js is big, and that's fine
  },
})
