import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // mongodb-memory-server needs to download/spawn a binary on first run.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Registers the next/headers cookie-jar double every test file gets (see
    // tests/integration/setup.ts). Inert for unit tests, which never import
    // next/headers.
    setupFiles: ['./tests/integration/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
