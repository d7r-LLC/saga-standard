// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: ['eslint:recommended', 'prettier'],
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'error',
    'no-var': 'error',
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    'object-shorthand': 'error',
    'prefer-template': 'error',
  },
  overrides: [
    {
      files: ['**/*.mjs'],
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2022,
      },
    },
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
      rules: {
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-non-null-assertion': 'warn',
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        'prefer-const': 'error',
        'no-var': 'error',
        eqeqeq: ['error', 'always', { null: 'ignore' }],
        'object-shorthand': 'error',
        'prefer-template': 'error',
        'sort-imports': ['error', { ignoreDeclarationSort: true }],
      },
    },
    {
      // CLI commands legitimately use console.log for user output
      files: ['packages/cli/src/**/*.ts'],
      rules: {
        'no-console': 'off',
      },
    },
    {
      // Test files: allow non-null assertions and console
      files: ['**/*.test.ts', '**/*.spec.ts', '**/test-helpers.ts'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        'no-console': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/', 'build/', 'node_modules/', 'coverage/', '*.min.js'],
}
