const globals = require("globals");
const tseslint = require("typescript-eslint");

module.exports = [
  {
    ignores: ["out/", "node_modules/"]
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    }
  },
  // Apply the recommended TypeScript ESLint configs first
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/prefer-as-const': 'warn',
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/no-inferrable-types': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
    }
  }
];