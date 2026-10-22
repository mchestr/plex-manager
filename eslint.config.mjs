import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import {
  restrictedSyntaxBlocks,
  restrictedSyntaxPlugin,
  restrictedSyntaxRule,
} from "./eslint/restricted-syntax.mjs";

// jsx-a11y is registered by the Next preset; only turn its recommended rules
// on, as warnings to be burned down over time. Rules the preset leaves off stay
// off, and rule options are kept.
const jsxA11yWarnings = Object.fromEntries(
  Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([rule, entry]) => {
    const [level, ...options] = Array.isArray(entry) ? entry : [entry];
    return [rule, level === "off" ? entry : ["warn", ...options]];
  }),
);

const chartImportBans = [
  { name: "recharts", message: "Draw charts with ChartCard (components/ui/chart-card.tsx) and a ChartSpec." },
  { name: "chart.js", message: "Chart.js is retired (P10.9); use ChartCard." },
  { name: "react-chartjs-2", message: "Chart.js is retired (P10.9); use ChartCard." },
];
/** The action barrels P11.5 deleted (DUP-16): import from the defining module. */
const barrelImportBans = [
  { name: "@/actions/admin", message: "The admin barrel is gone (P11.5): import from the module that defines the action." },
  { name: "@/actions/users", message: "The users barrel is gone (P11.5): import from actions/user-queries or lib/data/admin-users." },
];
const chartPatternBans = [
  { group: ["recharts/*", "chart.js/*"], message: "Draw charts with ChartCard (components/ui/chart-card.tsx)." },
];

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
    // P10.7: the client data-loading sweep left no hits in app, components and
    // hooks, so the burn-down rules are errors there.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/refs": "error",
      "react-hooks/preserve-manual-memoization": "error",
    },
  },
  {
    files: ["lib/**", "actions/**", "app/api/**"],
    ignores: ["lib/utils/logger.ts"],
    rules: {
      "no-console": "warn",
    },
  },
  ...restrictedSyntaxBlocks.map(({ files, ignores, level, selectors }) => ({
    files,
    ...(ignores ? { ignores } : {}),
    plugins: { "restricted-syntax": restrictedSyntaxPlugin },
    rules: { [restrictedSyntaxRule(level)]: [level, ...selectors] },
  })),
  {
    // Charts are ChartCard specs on shadcn Chart (P10.9): Recharts stays in
    // components/ui/chart*, and Chart.js does not come back. The deleted
    // action barrels stay gone (P11.5).
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    ignores: ["components/ui/chart.tsx", "components/ui/chart-card/**"],
    rules: {
      "no-restricted-imports": ["error", { paths: [...chartImportBans, ...barrelImportBans], patterns: chartPatternBans }],
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
