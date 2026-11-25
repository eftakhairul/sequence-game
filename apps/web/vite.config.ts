import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { workspaceAliases } from '../../vitest.aliases.js';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: workspaceAliases },
  server: {
    port: 5173,
    proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
  },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 600 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
