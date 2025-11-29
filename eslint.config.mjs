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
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-this-alias": "off",
      "prefer-const": "off",
      "react/no-unescaped-entities": "off",
    },
  },
];
