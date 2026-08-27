/**
 * Flat Config fuer ESLint 9.
 *
 * Die Erweiterungsskripte sind klassische Skripte (MV3-Hintergrundskripte in
 * Thunderbird sind Event Pages, keine Module) und teilen sich einen globalen
 * Scope - deshalb "script" statt "module" und die lib/-Namespaces als globals.
 */
export default [
  {
    files: ["background.js", "lib/**/*.js", "popup/**/*.js", "options/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "script",
      globals: {
        browser: "readonly",
        console: "readonly",
        document: "readonly",
        window: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        AbortController: "readonly",
        DOMParser: "readonly",
        URL: "readonly",
        Uint8Array: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        globalThis: "readonly",
        KimiConfig: "readonly",
        KimiMailText: "readonly",
        KimiI18n: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-implicit-globals": "off",
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
      "no-var": "error"
    }
  },
  {
    files: ["test/**/*.js", "scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: { require: "readonly", module: "readonly", __dirname: "readonly", process: "readonly", console: "readonly", globalThis: "readonly", Function: "readonly" }
    }
  }
];
