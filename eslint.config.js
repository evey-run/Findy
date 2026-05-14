import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist', 'server/dist', 'node_modules']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Bannir console.log et console.debug, autoriser warn/error pour les vrais cas
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // Côté serveur: tolère node globals
  {
    files: ['server/**/*.ts', 'prisma/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Côté serveur on a un logger pino - aucun console.* ne devrait passer
      'no-console': 'error',
    },
  },
])
