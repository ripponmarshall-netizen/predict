module.exports = [
  {
    ignores: ["node_modules/**", "**/*.jsx"],
  },
  // The service worker.
  {
    files: ["sw.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      globals: {
        self: "readonly",
        caches: "readonly",
        fetch: "readonly",
        Request: "readonly",
        URL: "readonly",
        Promise: "readonly",
        Set: "readonly",
      },
    },
    rules: { "no-unused-vars": ["error", { args: "none" }] },
  },
  // config.js: a plain browser script that sets one global.
  {
    files: ["config.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      globals: { window: "writable" },
    },
  },
  // Node scripts: tests, checks, this config.
  {
    files: [
      "predikt.test.js",
      "check-jsx.js",
      "eslint.config.js",
      "tests/**/*.js",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "writable",
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        document: "readonly",
        localStorage: "readonly",
        globalThis: "readonly",
      },
    },
    rules: { "no-unused-vars": ["error", { args: "none" }] },
  },
];
