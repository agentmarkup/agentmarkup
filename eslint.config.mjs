import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['**/dist/**', '**/node_modules/**']),
  {
    files: ['packages/core/**/*.{ts,js}', 'packages/vite/**/*.{ts,js}', 'packages/astro/**/*.{ts,js}', 'packages/next/**/*.{ts,js}', 'packages/cli/**/*.{ts,js}', 'packages/nuxt/**/*.{ts,js}', 'packages/audit/**/*.{ts,js}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
  {
    // Root-level tooling: `pnpm lint` runs `eslint scripts test`, so these need a
    // matching config block or ESLint resolves zero rules for them and the lint
    // pass silently covers nothing.
    files: ['scripts/**/*.{mjs,js}', 'test/**/*.{mjs,js}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['examples/vite-react/src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
  {
    files: ['examples/vite-react/vite.config.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
])
