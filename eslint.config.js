import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      'packages/ui/gallery-dist/**',
      '**/node_modules/**',
      'packages/sim-pvpoke/vendor/**',
      'packages/sim-pvpoke/src/globals-shim.js',
      'packages/sim-pvpoke/src/exports-tail.js',
      'packages/data/.pvpoke/**',
      'apps/web/public/data/**',
      // wrangler dev drops a generated bundle here; it is gitignored but eslint's ignores are
      // separate from .gitignore, so without this `npm run lint` breaks after any local run.
      'workers/counter/.wrangler/**',
      'docs/design/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/\u2014/]',
          message: 'No em dashes. Use a plain dash or rewrite.',
        },
      ],
    },
  },
  {
    files: ['eslint.config.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
