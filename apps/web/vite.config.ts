import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          data: ['@tanstack/react-query', 'i18next', 'react-i18next'],
          excel: ['write-excel-file/browser'],
        },
      },
    },
  },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  preview: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
