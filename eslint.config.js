import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default defineConfig(
  {
    ignores: [
      'dist/',
      'dev-dist/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      '.wrangler/',
      '.claude/',
      // Never shipped (AGENTS.md); Antigravity lints it with its own config if needed.
      'prototype/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: {
      // Everything goes through the structured logger (src/log), so the ring buffer sees it.
      'no-console': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      // Only the compiler options: ESLint can't serialize the Vite plugin's callback.
      parserOptions: {
        parser: tseslint.parser,
        svelteConfig: { compilerOptions: svelteConfig.compilerOptions },
      },
    },
    // Compiler warnings (a11y, unused CSS, rune/store clashes) fail lint; svelte-check reports
    // them too but can't fail on them while ui/ is empty.
    rules: { 'svelte/valid-compile': 'error' },
  },
  {
    files: ['tools/**', '*.config.{js,ts}', 'tests/**'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  {
    // Node runs these by stripping types, which fails on TypeScript that emits code.
    files: ['tools/**/*.ts', 'contracts/**/*.ts'],
    rules: {
      '@typescript-eslint/parameter-properties': ['error', { prefer: 'class-property' }],
      'no-restricted-syntax': [
        'error',
        { selector: 'TSEnumDeclaration', message: 'Node strips types only: use a const object.' },
        { selector: 'TSModuleDeclaration', message: 'Node strips types only: use a module.' },
      ],
    },
  },
  {
    // Logger sinks are the one place allowed to write to the console directly.
    files: ['src/log/**'],
    rules: { 'no-console': 'off' },
  },
);
