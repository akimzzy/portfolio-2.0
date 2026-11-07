import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const workerUrl = process.env.GAMES_WORKER_URL ?? 'http://127.0.0.1:8787';

export default defineConfig({
  root: 'apps/web',
  envDir: '../..',
  base: '/',
  publicDir: false,
  plugins: [react()],
  server: {
    host: process.env.GAMES_WEB_HOST ?? '127.0.0.1',
    port: Number(process.env.GAMES_DEMO_PORT ?? 4178),
    strictPort: true,
    proxy: {
      '/api': {
        target: workerUrl,
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: { polyfill: false },
  },
});
