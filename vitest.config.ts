import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/core/**/*.test.ts', 'tests/spec/**/*.test.ts'],
    environment: 'node',
  },
});
