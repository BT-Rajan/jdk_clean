import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

// Mirrors the two rules the previous oxlint setup (.oxlintrc.json,
// removed) actually enabled -- react-hooks/rules-of-hooks and
// react-refresh's only-export-components -- rather than adopting
// eslint-plugin-react-hooks' newer "recommended" preset, which now
// bundles ~15 additional React Compiler-oriented rules this project has
// never been checked against and doesn't opt into the compiler for.
export default tseslint.config(
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // TypeScript itself doesn't flag unused destructured bindings at
      // all (noUnusedLocals/noUnusedParameters skip destructuring
      // patterns entirely) -- this codebase leans on that to discard a
      // field via `{ key: _key, ...rest }`. @typescript-eslint's own
      // rule has no such exemption, so opt into the standard
      // leading-underscore-means-intentionally-unused convention
      // instead of renaming every call site.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
)
