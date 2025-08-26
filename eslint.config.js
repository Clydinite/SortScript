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
    },
    rules: {
      "semi": ["error", "always"],
      "quotes": ["error", "single"],
    },
  },
  ...tseslint.configs.recommended,
];
