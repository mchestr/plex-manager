/**
 * @jest-environment node
 *
 * Fixture tests for every `no-restricted-syntax` selector in
 * `eslint/restricted-syntax.mjs`.
 */

import { Linter } from "eslint"

import { formatting } from "../restricted-syntax.mjs"

const linter = new Linter({ configType: "flat" })

function hits(code: string): number {
  const messages = linter.verify(
    code,
    [
      {
        files: ["**/*.jsx"],
        languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
        rules: { "no-restricted-syntax": ["error", ...formatting] },
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
