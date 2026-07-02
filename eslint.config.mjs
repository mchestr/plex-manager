import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "**/__tests__/**",
      "e2e/**",
      "jest.config.js",
      "jest.setup.js",
      "playwright.config.ts",
      "next.config.js",
      "postcss.config.js",
      "prisma/schema.prisma",
      "lib/generated/prisma/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"],
    rules: {
      // Surface new `any` and `@ts-ignore` usages without failing the build,
      // per CLAUDE.md's strict/no-`any` stance. Existing violations become
      // warnings to be burned down over time.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      // Unused locals/params are already caught by tsconfig's
      // noUnusedLocals/noUnusedParameters, so leave the ESLint rule off to
      // avoid duplicate noise.
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-this-alias": "off",
      "prefer-const": "off",
      "react/no-unescaped-entities": "off",
    },
  },
  {
    // The centralized logger conditionally requires Winston/Chalk at runtime
    // (Node-only), which legitimately needs CommonJS require(). Scope the
    // require-imports exception to that file rather than disabling it globally.
    files: ["lib/utils/logger.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
