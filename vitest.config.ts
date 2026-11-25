import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests always use the public sample so results do not depend on private data.
  resolve: {
    alias: {
      'season-data': fileURLToPath(
        new URL('./content/sample-season.json', import.meta.url)
      ),
    },
  },
  test: {
    environment: 'node',
    env: { OUTNUMBER_SEASON: 'sample' },
    include: ['tests/**/*.test.ts'],
  },
});
