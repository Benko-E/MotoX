import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative paths, because GitHub Pages serves us from a /Moto/ subpath.
  base: './',

  server: {
    port: 5174, // Idle-Survivor uses 5173, so both can run at once
    strictPort: true,
  },

  build: {
    /**
     * The built site is committed to the repo and GitHub Pages serves it from
     * docs/ directly, instead of building it in the cloud. Licensed art packs
     * can't live in a public repo, so CI would not be able to build once real
     * art arrives; building here and committing the result avoids that.
     *
     * docs/ is wiped on every build. Never keep anything else in it.
     */
    outDir: 'docs',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 4000, // Three.js and Rapier are big, and that's fine
  },

  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
