/**
 * @jest-environment node
 *
 * Fixture tests for every `no-restricted-syntax` selector in
 * `eslint/restricted-syntax.mjs`.
 */

import path from "node:path"

import { Linter } from "eslint"

import config from "../../eslint.config.mjs"
import { actionsAndApi, deprecatedImports, formatting, inlineSvg, rawControls } from "../restricted-syntax.mjs"

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
})

function rawHits(code: string): number {
  const messages = linter.verify(
    code,
    [
      {
        files: ["**/*.jsx"],
        languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
        rules: { "no-restricted-syntax": ["error", ...rawControls, ...inlineSvg] },
      },
    ],
    "fixture.jsx",
  )
  expect(messages.filter((m) => m.ruleId !== "no-restricted-syntax")).toEqual([])
  return messages.length
}

describe("raw-element warnings (P3.4)", () => {
  it.each([
    '<button type="button">Save</button>',
    '<input type="text" />',
    "<select><option>One</option></select>",
    "<textarea />",
    '<svg viewBox="0 0 24 24"><path d="M0 0" /></svg>',
  ])("bans %s", (code) => {
    expect(rawHits(`const el = ${code}`)).toBe(1)
  })

  it.each([
    '<Button type="button">Save</Button>',
    "<Input />",
    "<Icon icon={Settings} />",
    "<div><span>Text</span></div>",
    "<buttonGroup />",
  ])("allows %s", (code) => {
    expect(rawHits(`const el = ${code}`)).toBe(0)
  })
})

describe("deprecated adapter imports (P3.5, P3.6)", () => {
  it.each([
    'import { StyledInput } from "@/components/ui/styled-input"',
    'import { StyledDropdown, DropdownOption } from "@/components/ui/styled-dropdown"',
    'import { StyledCheckbox } from "@/components/ui/styled-checkbox"',
    'import { ModalShell } from "@/components/ui/modal-shell"',
    'import { ConfirmModal } from "@/components/admin/shared/confirm-modal"',
  ])("warns on %s", (code) => {
    expect(hits(code, deprecatedImports)).toBe(1)
  })

  it.each([
    'import { Input } from "@/components/ui/input"',
    'import { Select } from "@/components/ui/select"',
    'import { styled } from "@/lib/styled-things"',
    'import { Dialog } from "@/components/ui/dialog"',
    'import { ConfirmDialog } from "@/components/ui/confirm-dialog"',
    'import { ModalShellNotes } from "@/components/ui/modal-shell-notes"',
  ])("allows %s", (code) => {
    expect(hits(code, deprecatedImports)).toBe(0)
  })
})

/**
 * Lints one fixture with the real config, so a later block that replaces a
 * level's selectors for a kind of file fails here. The paths need not exist.
 */
describe("what each kind of file gets from eslint.config.mjs", () => {
  const root = path.resolve(__dirname, "../..")
  const realLinter = new Linter({ configType: "flat", cwd: root })
  const source = [
    "export function Fixture({ n }) {",
    "  return (",
    "    <div>",
    '      <button type="button">{n.toLocaleString()}</button>',
    '      <svg viewBox="0 0 24 24" />',
    "    </div>",
    "  )",
    "}",
    "",
  ].join("\n")

  function lint(file: string) {
    const messages = realLinter
      .verify(source, config, path.join(root, file))
      .filter((m) => m.ruleId === "no-restricted-syntax" || m.ruleId === "restricted-syntax/warn")
    const of = (text: string) =>
      messages.filter((m) => m.message.includes(text)).map((m) => (m.severity === 2 ? "error" : "warn"))
    return { formatting: of("lib/utils/format.ts"), button: of("<button>"), svg: of("<svg>") }
  }

  it.each([
    ["components/admin/users/fixture.tsx", { formatting: ["error"], button: ["warn"], svg: ["warn"] }],
    ["app/admin/fixture/page.tsx", { formatting: ["error"], button: ["warn"], svg: ["warn"] }],
    ["components/ui/fixture.tsx", { formatting: ["error"], button: [], svg: [] }],
    ["app/dev/ui/fixture.tsx", { formatting: ["error"], button: [], svg: [] }],
    ["components/rewind/fixture.tsx", { formatting: ["error"], button: [], svg: [] }],
    ["app/api/fixture/route.tsx", { formatting: ["error"], button: [], svg: [] }],
    ["components/wrapped/fixture.tsx", { formatting: ["warn"], button: ["warn"], svg: [] }],
    ["lib/fixture.tsx", { formatting: ["warn"], button: [], svg: [] }],
  ])("%s", (file, expected) => {
    expect(lint(file)).toEqual(expected)
  })

  it.each([
    ["components/admin/users/fixture.tsx", ["warn"]],
    ["app/admin/fixture/page.tsx", ["warn"]],
    ["components/ui/fixture.tsx", []],
    ["app/dev/ui/fixture.tsx", []],
  ])("%s (deprecated adapter import)", (file, expected) => {
    const messages = realLinter
      .verify('import { StyledInput } from "@/components/ui/styled-input"\nexport { StyledInput }\n', config, path.join(root, file))
      .filter((m) => m.ruleId === "restricted-syntax/warn" || m.ruleId === "no-restricted-syntax")
    expect(messages.map((m) => (m.severity === 2 ? "error" : "warn"))).toEqual(expected)
  })

  const actionSource = [
    "export function fixture(n: number, error: unknown) {",
    '  return [n.toLocaleString(), error instanceof Error ? error.message : "Failed"]',
    "}",
    "",
  ].join("\n")

  it.each([
    ["actions/admin/fixture.ts", { formatting: ["warn"], errorText: ["warn"] }],
    ["actions/invite.ts", { formatting: ["error"], errorText: ["error"] }],
    ["app/api/fixture/route.ts", { formatting: ["error"], errorText: ["error"] }],
    ["lib/fixture.ts", { formatting: ["warn"], errorText: [] }],
  ])("%s (error text)", (file, expected) => {
    const messages = realLinter
      .verify(actionSource, config, path.join(root, file))
      .filter((m) => m.ruleId === "no-restricted-syntax" || m.ruleId === "restricted-syntax/warn")
    const of = (text: string) =>
      messages.filter((m) => m.message.includes(text)).map((m) => (m.severity === 2 ? "error" : "warn"))
    expect({ formatting: of("lib/utils/format.ts"), errorText: of("error.message") }).toEqual(expected)
  })
})
