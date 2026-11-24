import { defineConfig } from 'vitest/config';
import { workspaceAliases } from '../../vitest.aliases.js';

export default defineConfig({
  resolve: { alias: workspaceAliases },
  test: { include: ['test/**/*.test.ts'], testTimeout: 15000 },
});
