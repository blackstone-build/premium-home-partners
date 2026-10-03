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
      // `true` bans the directive outright. The rule's default still allows
      // `@ts-expect-error` when a description is attached.
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': true,
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
        },
      ],
    },
  },
);
