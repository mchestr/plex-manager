import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

// jsx-a11y is registered by the Next preset; only turn its recommended rules
// on, as warnings to be burned down over time. Rules the preset leaves off stay
// off, and rule options are kept.
const jsxA11yWarnings = Object.fromEntries(
  Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([rule, entry]) => {
    const [level, ...options] = Array.isArray(entry) ? entry : [entry];
    return [rule, level === "off" ? entry : ["warn", ...options]];
  }),
);

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "**/__tests__/**",
    "e2e/**",
    // Planning notes and their mockup tooling are not app code.
    ".agents/**",
    ".claude/worktrees/**",
    "jest.config.js",
    "jest.setup.js",
    "playwright.config.ts",
    "next.config.js",
    "postcss.config.js",
    "prisma/schema.prisma",
    "lib/generated/prisma/**",
  ]),
  js.configs.recommended,
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    files: ["**/*.{jsx,tsx}"],
    rules: jsxA11yWarnings,
  },
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
      // The Next preset turns this on as an error; apostrophes in JSX copy
      // are fine, so keep it off.
      "react/no-unescaped-entities": "off",
      // New preset rules start as warnings (the burn-down list). The
      // react-hooks compiler rules purity, set-state-in-effect and
      // static-components keep the preset's error level.
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  {
    files: ["lib/**", "actions/**", "app/api/**"],
    ignores: ["lib/utils/logger.ts"],
    rules: {
      "no-console": "warn",
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
]);
