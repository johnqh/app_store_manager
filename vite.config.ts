import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The UI is built to dist/ and served by the Bun server (server.ts) on the same
// origin as the API in production. In dev, Vite proxies /api to that server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5319,
    proxy: {
      '/api': 'http://localhost:4317',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
