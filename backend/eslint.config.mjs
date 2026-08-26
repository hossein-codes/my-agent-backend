import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Flat config for ESLint 9 (the `lint` script targets all TS files in src).
 * Style rules live in Prettier; ESLint only checks correctness.
 */
export default defineConfig([
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  globalIgnores(['dist/**', 'coverage/**', 'node_modules/**', 'prisma/generated/**']),
  {
    rules: {
      // NestJS DI relies on constructor parameter properties.
      '@typescript-eslint/no-explicit-any': 'warn',
      // `_name` marks intentionally unused args/vars (Express req, DI deps).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-console': 'off',
    },
  },
  {
    // Jest specs mock modules with jest.resetModules() + require().
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
