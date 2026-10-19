/**
 * @jest-environment node
 *
 * The three mockup cards render through the installed next/og (P2.14).
 * `@vercel/og` is an ES module that loads WASM, which Jest's module system
 * cannot import, so the cards render in a child process through
 * `scripts/rewind-measure-cards.tsx --check`, exactly as the measurement does.
 */
import { spawnSync } from "node:child_process"
import path from "node:path"

import { MOCKUP_CARDS } from "@/lib/rewind/cards/__fixtures__/mockup-cards"

const ROOT = path.resolve(__dirname, "../../../..")

interface Rendered {
  name: string
  artwork: boolean
  width: number
  height: number
  sha256: [string, string]
}

describe("mockup cards through next/og", () => {
  let rendered: Rendered[]

  beforeAll(() => {
    const child = spawnSync(
      path.join(ROOT, "node_modules/.bin/tsx"),
      ["--conditions=react-server", "scripts/rewind-measure-cards.tsx", "--check"],
      { cwd: ROOT, encoding: "utf8", timeout: 90_000 },
    )
    if (child.status !== 0) throw new Error(`render failed:\n${child.stderr}`)
    rendered = JSON.parse(child.stdout.trim().split("\n").pop() ?? "[]") as Rendered[]
  }, 120_000)

  it("renders every card at its size", () => {
    expect(rendered.map(({ name, width, height }) => ({ name, width, height }))).toEqual(
      MOCKUP_CARDS.map(({ name, width, height }) => ({ name, width, height })),
    )
  })

  it("renders a type-only card byte-identically twice (NFR-2)", () => {
    const typeOnly = rendered.filter((card) => !card.artwork)
    expect(typeOnly.map((card) => card.name)).toContain("centrefold")
    for (const card of typeOnly) expect(card.sha256[1]).toBe(card.sha256[0])
  })
})
