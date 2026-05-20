const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');

module.exports = [
  js.configs.recommended,

  // Server-side files (Node.js environment)
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.commonjs,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'warn',
      semi: ['warn', 'always'],
      'no-empty': 'warn',
      'no-redeclare': 'warn',
      'no-constant-condition': 'warn',
      'no-prototype-builtins': 'warn',
      'no-useless-assignment': 'warn',
      'no-useless-catch': 'warn',
      'no-useless-escape': 'warn',
      'no-case-declarations': 'warn',
      'no-self-assign': 'warn',
      'no-unsafe-finally': 'warn',
      'no-const-assign': 'warn',
      'no-duplicate-case': 'warn',
      'preserve-caught-error': 'off',
    },
  },

  // Browser-side files (public/ and game/)
  {
    files: ['public/**/*.js', 'game/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
  },

  // TypeScript files
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ['**/*.ts'],
  })),
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.commonjs,
      },
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      semi: ['warn', 'always'],
      'no-empty': 'warn',
      'no-constant-condition': 'warn',
      'no-prototype-builtins': 'warn',
      'no-useless-catch': 'warn',
      'no-useless-escape': 'warn',
      'no-case-declarations': 'warn',
      'no-self-assign': 'warn',
      'no-unsafe-finally': 'warn',
    },
  },

  // Modularization guard: warn on large backend modules (Phase 4 application/* excluded)
  {
    files: ['packages/**/*.ts', 'server/**/*.ts', 'server.ts'],
    rules: {
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },

  // Ignored paths
  {
    ignores: [
      'node_modules/**',
      'data/**',
      'game/chess-pal/**',
    ],
  },
];
