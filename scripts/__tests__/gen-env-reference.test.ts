/**
 * @jest-environment node
 */

/**
 * The environment reference (P11.24, GAP-18): docs/environment.md and the
 * generated block of example.env come from envSchema's metadata, the committed
 * files are current, and `--check` catches a changed description.
 */

import { readFileSync } from "node:fs"
import path from "node:path"

import { checkProductionEnv, envSchema } from "@/lib/env"
import {
  DOC_PATH,
  envEntries,
  EXAMPLE_PATH,
  main,
  renderExampleBlock,
  renderMarkdown,
  replaceExampleBlock,
  type EnvEntry,
  type GenDeps,
} from "@/scripts/gen-env-reference"

const ROOT = path.resolve(__dirname, "../..")
const entries = envEntries()
const names = Object.keys(envSchema.shape)

function deps(): GenDeps & { lines: string[]; written: Record<string, string> } {
  const lines: string[] = []
  const written: Record<string, string> = {}
  return {
    lines,
    written,
    readFile: (relative) => readFileSync(path.join(ROOT, relative), "utf8"),
    writeFile: (relative, text) => {
      written[relative] = text
    },
    log: (line) => lines.push(line),
  }
}

describe("gen-env-reference", () => {
  it("lists every envSchema variable in both outputs", () => {
    const markdown = renderMarkdown(entries)
    const example = renderExampleBlock(entries)
    expect(names.filter((name) => !markdown.includes(`| \`${name}\` |`))).toEqual([])
    expect(names.filter((name) => !new RegExp(`^(# )?${name}=`, "m").test(example))).toEqual([])
  })

  it("matches the committed docs/environment.md and example.env", () => {
    const d = deps()
    expect(main(["--check"], d)).toBe(0)
    expect(d.lines).toEqual([])
  })

  it("fails --check after a description change, and rewrites both files without it", () => {
    const changed: EnvEntry[] = entries.map((entry) =>
      entry.name === "TRUSTED_PROXY_HOPS" ? { ...entry, description: "Changed." } : entry
    )
    const checked = deps()
    expect(main(["--check"], checked, changed)).toBe(1)
    expect(checked.lines).toEqual([
      `${DOC_PATH} is out of date with lib/env.ts: run npm run env:docs`,
      `${EXAMPLE_PATH} is out of date with lib/env.ts: run npm run env:docs`,
    ])
    expect(checked.written).toEqual({})

    const written = deps()
    expect(main([], written, changed)).toBe(0)
    expect(written.written[DOC_PATH]).toContain("| `TRUSTED_PROXY_HOPS` |  | `1` | Changed. |")
    expect(written.written[EXAMPLE_PATH]).toContain("# Changed.\n# Default: 1\n# TRUSTED_PROXY_HOPS=")
  })

  it("puts the test-only variables in their own block, last", () => {
    const testOnly = entries.filter((entry) => entry.group === "Test only").map((entry) => entry.name)
    expect(testOnly).toEqual(expect.arrayContaining(["E2E_DATABASE_URL", "E2E_TEST_MODE", "SKIP_CONNECTION_TESTS"]))
    expect(names.filter((name) => name.startsWith("E2E_") && !testOnly.includes(name))).toEqual([])

    const example = renderExampleBlock(entries)
    const [production, tests] = example.split("# TEST ONLY - NEVER IN PRODUCTION")
    for (const name of testOnly) {
      expect(tests).toMatch(new RegExp(`^(# )?${name}=`, "m"))
      expect(production).not.toMatch(new RegExp(`^(# )?${name}=`, "m"))
    }
    const markdownTests = renderMarkdown(entries).split("## Test only")[1]
    expect(testOnly.filter((name) => !markdownTests.includes(`\`${name}\``))).toEqual([])
  })

  it("marks requiredInProduction exactly where checkProductionEnv reports a missing variable", () => {
    const valid: Record<string, string> = {
      DATABASE_URL: "postgresql://u:p@db:5432/app",
      NEXTAUTH_URL: "https://plex.example.com",
      NEXT_PUBLIC_APP_URL: "https://plex.example.com",
      NEXTAUTH_SECRET: "Zq8vK2mR7xLp4Wn9Tb6Yc3Hd1Fg5Js0A",
      PLEX_CLIENT_IDENTIFIER: "0123456789abcdef0123456789abcdef",
    }
    expect(checkProductionEnv(envSchema.parse(valid))).toEqual([])

    const missing = Object.keys(valid).filter((name) => {
      const env = { ...valid }
      delete env[name]
      return checkProductionEnv(envSchema.parse(env)).some(
        (issue) => issue.variable === name && issue.code === "missing"
      )
    })
    expect(entries.filter((entry) => entry.requiredInProduction).map((entry) => entry.name).sort()).toEqual(missing.sort())
  })

  it("refuses an example.env without its markers", () => {
    expect(() => replaceExampleBlock("FOO=1\n", "# BEGIN GENERATED\n# END GENERATED")).toThrow(/BEGIN GENERATED/)
  })
})
