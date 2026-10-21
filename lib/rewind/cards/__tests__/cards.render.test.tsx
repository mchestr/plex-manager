/**
 * @jest-environment node
 *
 * Every card (P5.11's core cards and P7.6's rest) on the heavy, median,
 * light and extreme fixtures, the light member's pocket cut and a postcard: each eligible card renders to a PNG through
 * the installed next/og (in a child process, since Jest cannot load
 * `@vercel/og`'s WASM), and the card rules hold in the element tree:
 *
 * - unsigned cards have no first name in any text node;
 * - the guess teaser never prints the No. 1 title;
 * - the requests card prints no title at all;
 * - the percentile card is absent at top 26%, and the calendar card needs Daily detail.
 */

import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { isValidElement, type ReactElement, type ReactNode } from "react"

import { CARD_PAGES, renderCard } from "@/lib/rewind/cards"
import { CARD_PAGE_TYPES, eligibleCards } from "@/lib/rewind/cards/eligible"
import { editionRewind, fixtureRewind, shareContext, shareOptions } from "@/lib/wrapped/data/__tests__/share-fixture"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { cardInput, toShareSafe, type CardInput } from "@/lib/wrapped/data/share-safe"
import type { ShareOptions, SharePageType } from "@/lib/wrapped/data/share-safe-schema"
import { FACTS, type FactId } from "@/lib/wrapped/facts/catalogue"

const ROOT = path.resolve(__dirname, "../../../..")
const FIXTURES = ["heavy", "median", "light", "extreme", "pocket", "postcard"] as const

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
  for (const id of ["heavy", "median", "light", "extreme", "night-owl"]) rewinds.set(id, await fixtureRewind(id))
  rewinds.set("pocket", await editionRewind("pocket"))
  rewinds.set("postcard", await editionRewind("postcard"))
})

/** The eligible cards' inputs under `overrides`, every page published. */
function inputs(rewind: RewindDataV3, overrides: Partial<ShareOptions> = {}): CardInput[] {
  const ctx = shareContext()
  const options = shareOptions(overrides)
  const shared = toShareSafe(rewind, options, ctx)
  return eligibleCards(shared, options).flatMap((page) => {
    const input = cardInput(shared, page, "story", { factsHash: rewind.factsHash, options, ctx })
    return input ? [input] : []
  })
}

const cardText = (input: CardInput | undefined) => (input ? texts(renderCard(input)).join(" ") : "")

it("keeps a renderer for exactly the listed cards", () => {
  expect([...CARD_PAGES].sort()).toEqual([...CARD_PAGE_TYPES].sort())
})

it.each([
  ["heavy", 14],
  ["median", 14],
  ["light", 11],
  ["extreme", 10],
  ["pocket", 5],
  ["postcard", 1],
] as const)("lists the %s issue's eligible cards", (id, count) => {
  const rewind = rewinds.get(id)!
  const cards = inputs(rewind).map((input) => input.page.type)
  expect(cards).toHaveLength(count)
  expect(cards.every((type: SharePageType) => rewind.pages.some((page) => page.type === type))).toBe(true)
})

it("never prints the No. 1 title on the guess teaser", () => {
  const rewind = rewinds.get("median")!
  const teaser = inputs(rewind).find((input) => input.page.type === "guess")
  const first = rewind.facts["series[1].title"]!.display
  expect(teaser?.page.titles.length).toBeGreaterThan(0)
  expect(teaser!.page.titles).not.toContain(first)
  expect(cardText(teaser)).not.toContain(first)
})

it("prints no title on the requests card", () => {
  const rewind = rewinds.get("heavy")!
  const requests = inputs(rewind).find((input) => input.page.type === "requests")
  const titles = (Object.keys(rewind.facts) as FactId[]).filter((id) => FACTS[id].unit === "title").map((id) => rewind.facts[id]!.display)
  expect(requests?.page.titles).toEqual([])
  const text = cardText(requests)
  expect(titles.filter((title) => text.includes(title))).toEqual([])
})

it("leaves the percentile card out at top 26%", () => {
  const heavy = rewinds.get("heavy")!
  expect(inputs(heavy).some((input) => input.page.type === "standing")).toBe(true)
  const at26: RewindDataV3 = { ...heavy, facts: { ...heavy.facts, "standing.percentile": { ...heavy.facts["standing.percentile"]!, value: 26, display: "Top 26%" } } }
  expect(inputs(at26).some((input) => input.page.type === "standing")).toBe(false)
})

it("lists the calendar card only with Daily detail", () => {
  const heavy = rewinds.get("heavy")!
  expect(inputs(heavy).some((input) => input.page.type === "calendar")).toBe(false)
  const calendar = inputs(heavy, { dailyDetail: true }).find((input) => input.page.type === "calendar")
  expect(calendar?.page.soundtrack?.grain).toBe("daily")
})

it("stamps the Records box only where the server has medians", () => {
  const records = (id: string) => inputs(rewinds.get(id)!).find((input) => input.page.type === "records")?.page.graphic
  expect(records("heavy")).toMatchObject({ kind: "records" })
  for (const id of ["heavy", "median", "night-owl"]) {
    const graphic = records(id)
    if (graphic?.kind === "records" && graphic.stamp) expect(graphic.cells).toContain(graphic.stamp)
  }
})

describe.each(FIXTURES)("the %s fixture", (id) => {
  it("never names the member on an unsigned card", () => {
    const rewind = rewinds.get(id)!
    const first = rewind.facts["member.firstName"]?.display
    if (!first) return
    const named = new RegExp(`\\b${first}\\b`, "i")
    for (const input of [...inputs(rewind), ...inputs(rewind, { dailyDetail: true, includeArt: true })]) {
      expect(texts(renderCard(input)).filter((s) => named.test(s))).toEqual([])
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
    const dir = mkdtempSync(path.join(os.tmpdir(), `rewind-cards-${id}-`))
    try {
      const all = [...inputs(rewinds.get(id)!), ...inputs(rewinds.get(id)!, { signed: true, dailyDetail: true })]
      const file = path.join(dir, "inputs.json")
      writeFileSync(file, JSON.stringify(all))
      const child = spawnSync(path.join(ROOT, "node_modules/.bin/tsx"), ["--conditions=react-server", "scripts/rewind-render-cards.tsx", file], {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 240_000,
        env: { ...process.env, REWIND_CACHE_DIR: dir },
      })
      if (child.status !== 0) throw new Error(`render failed:\n${child.stderr}`)
      const results = JSON.parse(child.stdout.trim().split("\n").pop() ?? "[]") as Array<{ page: string; bytes: number }>
      expect(results.map((r) => r.page)).toEqual(all.map((input) => input.page.type))
      expect(results.every((r) => r.bytes > 1000)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 300_000)
})
