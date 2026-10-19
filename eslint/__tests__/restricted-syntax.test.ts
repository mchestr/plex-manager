/**
 * @jest-environment node
 *
 * Fixture tests for every `no-restricted-syntax` selector in
 * `eslint/restricted-syntax.mjs`.
 */

import { Linter } from "eslint"

import { actionsAndApi, formatting, restrictedSyntaxBlocks } from "../restricted-syntax.mjs"

const linter = new Linter({ configType: "flat" })

function hits(code: string, selectors: unknown[] = formatting): number {
  const messages = linter.verify(
    code,
    [
      {
        files: ["**/*.jsx"],
        languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
        rules: { "no-restricted-syntax": ["error", ...selectors] },
      },
    ],
    "fixture.jsx",
  )
  expect(messages.filter((m) => m.ruleId !== "no-restricted-syntax")).toEqual([])
  return messages.length
}

describe("formatting bans (P3.10)", () => {
  it.each([
    "n.toLocaleString()",
    'd.toLocaleDateString("en-US", { month: "short" })',
    "new Date(x).toLocaleTimeString()",
    "a?.b.toLocaleString()",
  ])("bans %s", (code) => {
    expect(hits(code)).toBe(1)
  })

  it.each([
    "const s = `$${cost.toFixed(2)}`",
    "const s = `Cost: $${cost.toFixed(4)}/request`",
    "const el = <div>${cost.toFixed(3)}</div>",
    "const el = <div>Total: ${(a / b).toFixed(2)}</div>",
  ])("bans money built with toFixed: %s", (code) => {
    expect(hits(code)).toBe(1)
  })

  it.each([
    "const s = `${pct.toFixed(1)}%`",
    "const el = <div>{pct.toFixed(1)}%</div>",
    "const s = n.toFixed(2)",
    "formatNumber(n, settings)",
  ])("allows %s", (code) => {
    expect(hits(code)).toBe(0)
  })
})

describe("error-text ban in actions and route handlers (P4.3)", () => {
  it.each([
    'function f(error) { return { success: false, error: error instanceof Error ? error.message : "Failed" } }',
    'const reason = e instanceof Error ? e.message : "unknown"',
  ])("bans %s", (code) => {
    expect(hits(code, actionsAndApi)).toBe(1)
  })

  it.each([
    'logger.error("Failed", error instanceof Error ? error : undefined)',
    "const name = error instanceof Error ? error.name : String(error)",
    'const result = toActionError(error, "Failed")',
  ])("allows %s", (code) => {
    expect(hits(code, actionsAndApi)).toBe(0)
  })

  it("is an error in app/api and the migrated modules, and repeats the formatting bans there", () => {
    const errorBlock = restrictedSyntaxBlocks.find(
      (block) => block.level === "error" && block.files.includes("app/api/**/*.{ts,tsx}")
    )
    expect(errorBlock?.files).toContain("actions/invite.ts")
    expect(errorBlock?.selectors).toEqual([...formatting, ...actionsAndApi])
  })
})
