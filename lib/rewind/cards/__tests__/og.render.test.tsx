/**
 * @jest-environment node
 *
 * The 1200 x 630 OG card (P7.5, design 6.7): the centrefold layout when page
 * 16 or 18 is published, a type-only preview of the first published page
 * otherwise, and no name unless signed. The PNG renders through the installed
 * next/og in a child process, as the other card render tests do.
 */

import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { isValidElement, type ReactElement, type ReactNode } from "react"

import { OgCard, ogItems, ogPage } from "@/lib/rewind/cards/og"
import { fixtureRewind, shareContext, shareOptions } from "@/lib/wrapped/data/__tests__/share-fixture"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { cardInput, toShareSafe, type CardInput } from "@/lib/wrapped/data/share-safe"
import type { ShareOptions, SharePageType } from "@/lib/wrapped/data/share-safe-schema"

const ROOT = path.resolve(__dirname, "../../../..")

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

let heavy: RewindDataV3

beforeAll(async () => {
  heavy = await fixtureRewind("heavy")
})

/** The OG input of the page `ogPage` picks for a link publishing `pages`. */
function ogInput(pages: SharePageType[], overrides: Partial<ShareOptions> = {}): CardInput {
  const ctx = shareContext()
  const options = shareOptions({ pages, ...overrides })
  const shared = toShareSafe(heavy, options, ctx)
  const page = ogPage(shared.pages.map((p) => p.type))
  const input = page && cardInput(shared, page, "og", { factsHash: heavy.factsHash, options, ctx })
  if (!input) throw new Error(`no OG input for ${pages.join(", ")}`)
  return input
}

describe("ogPage", () => {
  it("prefers the centrefold, then the back cover, else the first published page", () => {
    expect(ogPage(["top-shows", "clock"])).toBe("top-shows")
    expect(ogPage(["cover", "back-cover"])).toBe("back-cover")
    expect(ogPage(["cover", "centrefold", "back-cover"])).toBe("centrefold")
    expect(ogPage([])).toBeNull()
  })
})

describe("OgCard", () => {
  it("uses the centrefold layout when page 16 is published", () => {
    const input = ogInput(["cover", "top-shows", "centrefold"])
    expect(input.page.type).toBe("centrefold")
    const printed = texts(OgCard(input)).join(" ")
    expect(printed).toContain("I’m the")
    expect(printed).not.toContain("Centrefold")
  })

  it("uses the centrefold layout for the back cover when only page 18 carries the archetype", () => {
    const input = ogInput(["top-shows", "back-cover"])
    expect(input.page.type).toBe("back-cover")
    expect(texts(OgCard(input)).join(" ")).toContain("I’m the")
  })

  it("is a type-only preview of the first published page otherwise: masthead, page name, headline and its No. 1", () => {
    const input = ogInput(["top-shows"])
    const printed = texts(OgCard(input))
    expect(printed).toContain("Rewind 2026")
    expect(printed).toContain("Chester Family Plex")
    expect(printed).toContain("Top shows")
    expect(input.page.titles[0]).toBeDefined()
    expect(printed).toContain(input.page.titles[0])
    expect(ogItems(input).length).toBeLessThanOrEqual(2)
    const all = printed.join(" ")
    expect(all).not.toContain("I’m the")
    for (const id of ["time.totalHours", "standing.percentile", "streak.longest.days"] as const) {
      const display = heavy.facts[id]?.display
      if (display) expect(printed).not.toContain(display)
    }
    if (heavy.archetype) expect(all).not.toContain(heavy.archetype.id)
  })

  it("prints no name unless the link is signed", () => {
    const first = heavy.facts["member.firstName"]?.display
    expect(first).toBeDefined()
    const named = new RegExp(`\\b${first}\\b`, "i")
    for (const pages of [["top-shows"], ["cover"], ["centrefold"], ["back-cover"]] as SharePageType[][]) {
      expect(texts(OgCard(ogInput(pages))).filter((text) => named.test(text))).toEqual([])
    }
  })

  it("renders 1200 x 630 PNGs through next/og", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "rewind-og-cards-"))
    try {
      const inputs = [ogInput(["top-shows"]), ogInput(["clock"]), ogInput(["centrefold"]), ogInput(["number"], { signed: true })]
      const file = path.join(dir, "inputs.json")
      writeFileSync(file, JSON.stringify(inputs))
      const child = spawnSync(path.join(ROOT, "node_modules/.bin/tsx"), ["--conditions=react-server", "scripts/rewind-render-cards.tsx", file], {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 120_000,
      })
      if (child.status !== 0) throw new Error(`render failed:\n${child.stderr}`)
      const results = JSON.parse(child.stdout.trim().split("\n").pop() ?? "[]") as Array<{ page: string; bytes: number }>
      expect(results.map((r) => r.page)).toEqual(["top-shows", "clock", "centrefold", "number"])
      expect(results.every((r) => r.bytes > 1000)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 150_000)
})
