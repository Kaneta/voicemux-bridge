import js from "@eslint/js";
import globals from "globals";

/**
 * [Intent: AI-Agent Patch Reliability Config]
 * This ESLint configuration enforces explicit coding styles to ensure 
 * that AI agents can reliably match and patch code blocks without ambiguity.
 */
export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        chrome: "readonly",
      },
    },
    rules: {
      // 1. Mandatory Braces: No implicit arrow returns.
      // Ensures AI can always find stable '{' and '}' markers for patching.
      "arrow-body-style": ["error", "always"],
      "curly": ["error", "all"],

      // 2. No Complex Ternaries: Prefer explicit if/else blocks.
      "no-nested-ternary": "error",
      "no-ternary": "warn", // Optional but encouraged for AI reliability

      // 3. Error Prevention
      "no-unused-vars": "warn",
      "no-console": "off",
      "no-undef": "error",
      "no-empty": "error",

      // 4. Stylistic Consistency
      "semi": ["error", "always"],
      "quotes": ["error", "double"],
    },
  },
];
