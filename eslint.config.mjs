// Configuration ESLint (flat config) — Mbolo Santé
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      // Pas de console.log : utiliser le journal sécurisé (@mbolo/journal-securise),
      // qui masque les données de santé et les secrets.
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
