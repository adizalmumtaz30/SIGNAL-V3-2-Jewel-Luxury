import { defineConfig, type UserConfig } from 'vite';
import type { InlineConfig } from 'vitest/node';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    hmr: false,
    allowedHosts: true,
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
  },
} as UserConfig & { test: InlineConfig });
