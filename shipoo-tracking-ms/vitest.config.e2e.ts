import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['./test/e2e-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 90_000,
    sequence: { concurrent: false },
  },
});
