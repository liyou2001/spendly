import js from '@eslint/js';
import expoConfig from 'eslint-config-expo/flat.js';
import prettierConfig from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const mobileFiles = 'apps/mobile/**';

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/.expo/',
    '**/dist/',
    '**/web-build/',
    '**/coverage/',
    '**/expo-env.d.ts',
    'apps/mobile/ios/',
    'apps/mobile/android/',
    'supabase/.temp/',
    'supabase/.branches/',
  ]),

  // Packages, scripts and Edge Functions.
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    ignores: [mobileFiles],
    extends: [js.configs.recommended, tseslint.configs.strict],
    languageOptions: { globals: globals.node },
  },

  // Expo app: Expo's own rules (React, hooks, imports, TypeScript).
  {
    files: [mobileFiles],
    extends: [expoConfig],
  },

  // Keep formatting rules out of ESLint; Prettier owns them.
  prettierConfig,
]);
