import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      // Keep local API calls same-origin from the worker's point of view.
      // Without this, the worker's CSRF check sees localhost:5173 against
      // localhost:8787 and rejects sign-in and other write requests.
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('origin', 'http://localhost:8787');
          });
        },
      },
    },
  },
});
