import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/handlers/**/*.ts', 'src/types/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts']
    },
    // Мок Figma API загружается автоматически
    setupFiles: ['./tests/setup.ts']
  }
});

