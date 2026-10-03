import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'apps/mobile/.expo/**'] },
  {
    files: ['apps/mobile/**/*.{ts,tsx}', 'packages/pricing/**/*.ts', 'e2e/**/*.ts', 'supabase/functions/**/*.ts'],
    extends: [tseslint.configs.base],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
    },
  },
);
