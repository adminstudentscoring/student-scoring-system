const js = require('@eslint/js');
const globals = require('globals');

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

  // Ignored paths
  {
    ignores: [
      'node_modules/**',
      'data/**',
      'game/chess-pal/**',
    ],
  },
];
