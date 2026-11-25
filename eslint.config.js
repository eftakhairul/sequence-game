import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'packages/rules/src/boardLayout.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // The rules engine must stay pure: no DOM, no Node APIs, no I/O.
    files: ['packages/rules/src/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': ['error', 'process', 'window', 'document', 'setTimeout', 'Date'],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in rng.ts.' },
      ],
      'no-restricted-imports': ['error', { patterns: ['node:*', 'fs', 'path'] }],
    },
  },
  {
    // The server must contain no game logic beyond calling the rules engine.
    files: ['apps/server/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: '@lineup/rules', importNames: ['detectLines', 'lockedCells'] }] },
      ],
    },
  },
);
