/**
 * @jest-environment node
 *
 * The six core cards (P5.11) on the heavy, median and light fixtures: each
 * renders to a PNG through the installed next/og (in a child process, since
 * Jest cannot load `@vercel/og`'s WASM), unsigned cards carry no first name
 * in any text node, and `eligibleCards` lists the cards each issue can share.
 */

import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { isValidElement, type ReactElement, type ReactNode } from "react"

import { CARD_PAGES, renderCard } from "@/lib/rewind/cards"
import { CARD_PAGE_TYPES, eligibleCards } from "@/lib/rewind/cards/eligible"
import { fixtureRewind, shareContext, shareOptions } from "@/lib/wrapped/data/__tests__/share-fixture"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { cardInput, toShareSafe, type CardInput } from "@/lib/wrapped/data/share-safe"
import type { ShareOptions, SharePageType } from "@/lib/wrapped/data/share-safe-schema"

const ROOT = path.resolve(__dirname, "../../../..")
const FIXTURES = ["heavy", "median", "light"] as const

/** Every string a card's host tree prints. */
function texts(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return []
  if (typeof node === "string" || typeof node === "number") return [String(node)]
  if (Array.isArray(node)) return node.flatMap(texts)
  if (!isValidElement(node)) return []
  const element = node as ReactElement<{ children?: ReactNode }>
  if (typeof element.type === "function") return texts((element.type as (props: unknown) => ReactNode)(element.props))
  return texts(element.props.children)
}

const rewinds = new Map<string, RewindDataV3>()

beforeAll(async () => {
  for (const id of FIXTURES) rewinds.set(id, await fixtureRewind(id))
})

function inputs(rewind: RewindDataV3, overrides: Partial<ShareOptions> = {}): CardInput[] {
  const ctx = shareContext()
  const pages = eligibleCards(rewind, { dailyDetail: false })
  const options = shareOptions({ pages, ...overrides })
  const shared = toShareSafe(rewind, options, ctx)
  return pages.flatMap((page) => {
    const input = cardInput(shared, page, "story", { factsHash: rewind.factsHash, options, ctx })
    return input ? [input] : []
  })
}

it("keeps a renderer for exactly the core cards", () => {
  expect([...CARD_PAGES].sort()).toEqual([...CARD_PAGE_TYPES].sort())
})

it.each([
  ["heavy", 6],
  ["median", 6],
  ["light", 5],
] as const)("lists the %s issue's eligible cards", (id, count) => {
  const rewind = rewinds.get(id)!
  const cards = eligibleCards(rewind, { dailyDetail: false })
  expect(cards).toHaveLength(count)
  expect(cards.every((type: SharePageType) => rewind.pages.some((page) => page.type === type))).toBe(true)
})

it("leaves the calendar out without daily detail", () => {
  const pages = [{ type: "cover" as const }, { type: "calendar" as const }]
  expect(eligibleCards({ pages }, { dailyDetail: false })).toEqual(["cover"])
})

describe.each(FIXTURES)("the %s fixture", (id) => {
  it("never names the member on an unsigned card", () => {
    const first = rewinds.get(id)!.facts["member.firstName"]?.display
    if (!first) return
    for (const input of inputs(rewinds.get(id)!)) {
      const strings = texts(renderCard(input))
      const named = new RegExp(`\\b${first}\\b`, "i")
      expect(strings.filter((s) => named.test(s))).toEqual([])
    }
  })

  it("names the member in the back cover's billing only when signed", () => {
    const rewind = rewinds.get(id)!
    const first = rewind.facts["member.firstName"]?.display
    const back = inputs(rewind, { signed: true }).find((input) => input.page.type === "back-cover")
    if (!first || !back) return
    expect(texts(renderCard(back)).join(" ")).toContain(first.toLocaleUpperCase("en-US"))
  })

  it("renders every eligible card to a PNG", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), `rewind-core-cards-${id}-`))
    try {
      const all = [...inputs(rewinds.get(id)!), ...inputs(rewinds.get(id)!, { signed: true, dailyDetail: true })]
      const file = path.join(dir, "inputs.json")
      writeFileSync(file, JSON.stringify(all))
      const child = spawnSync(path.join(ROOT, "node_modules/.bin/tsx"), ["--conditions=react-server", "scripts/rewind-render-cards.tsx", file], {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 120_000,
      })
      if (child.status !== 0) throw new Error(`render failed:\n${child.stderr}`)
      const results = JSON.parse(child.stdout.trim().split("\n").pop() ?? "[]") as Array<{ page: string; bytes: number }>
      expect(results.map((r) => r.page)).toEqual(all.map((input) => input.page.type))
      expect(results.every((r) => r.bytes > 1000)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 150_000)
})
