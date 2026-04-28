import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    reporters: ['default']
  },
  resolve: {
    alias: {
      '@crawlix/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@crawlix/scoring': resolve(__dirname, 'packages/scoring/src/index.ts')
    }
  }
});
