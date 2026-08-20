/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Fail loudly on a port conflict instead of silently moving to 5174+ —
    // a silently-shifted port doesn't match the backend's CORS_ORIGIN and
    // fails as a confusing "Failed to fetch" instead of an obvious error.
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    css: true,
  },
});
