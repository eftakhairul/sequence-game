import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(`./${p}/src/index.ts`, import.meta.url));

/** Resolve workspace packages to their TypeScript sources in tests and dev builds. */
export const workspaceAliases = {
  '@lineup/rules': src('packages/rules'),
  '@lineup/protocol': src('packages/protocol'),
  '@lineup/shared-config': src('packages/shared-config'),
};
