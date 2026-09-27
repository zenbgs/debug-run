import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    // Phaser is large; keep it in its own chunk so game code can be re-cached alone.
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
});
