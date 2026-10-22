/**
 * @jest-environment node
 */

/**
 * The playground's view of a recorded dry run (P8.8): the trail read back
 * into facts, selection, copy and cost, every token naming a fact on the
 * sheet, and the diff against a stored Rewind.
 */

import { readFileSync, writeFileSync } from "node:fs"

import type { CompletedDryRun } from "@/lib/rewind/dry-run/store"
import { diffAgainstStored, playgroundView, type PlaygroundView } from "@/lib/rewind/playground/view"

import { RECORDED_PREVIEW_ID, RECORDED_VIEW_FILE, recordedRun } from "./recorded-run"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

let run: CompletedDryRun
let view: PlaygroundView

beforeAll(async () => {
  run = await recordedRun()
  const built = playgroundView(RECORDED_PREVIEW_ID, run)
  if (!built) throw new Error("The recorded trail did not parse")
  view = built
})

describe("playgroundView", () => {
  it("reads the fact sheet, the printed pages and the omitted ones with a reason", () => {
    expect(view.facts.length).toBeGreaterThan(0)
    expect(view.pages.map((p) => p.type)).toEqual(run.data.pages.map((p) => p.type))
    for (const page of view.omitted) expect(page.reason).not.toBe("")
    expect(view.year).toBe(run.data.year)
  })

  it("renders every printed slot with tokens that name facts, the hostile titles held inside title tokens", () => {
    expect(view.copy.length).toBeGreaterThan(0)
    const tokens = view.copy.flatMap((slot) => slot.segments.filter((s) => s.kind !== "text"))
    expect(tokens.length).toBeGreaterThan(0)
    for (const token of tokens) {
      const fact = run.data.facts[token.id as keyof typeof run.data.facts]
      if (!token.id.startsWith("copy.")) expect(token.text).toBe(fact?.display)
    }
    for (const slot of view.copy) {
      for (const segment of slot.segments) if (segment.kind === "title") expect(slot.text).toContain(`{{fact:${segment.id}}}`)
    }
  })

  it("keeps the raw answer and the usage of a model run", () => {
    expect(view.raw).not.toBeNull()
    expect(view.usage.calls).toBeGreaterThan(0)
    expect(view.usage.path).toBe("llm")
  })

  it("is null for a trail that no longer parses", () => {
    expect(playgroundView(RECORDED_PREVIEW_ID, { ...run, trail: { pages: "nope" } })).toBeNull()
  })

  it("marks a repaired or fallback slot and keeps its grounding issues", () => {
    const [first] = view.copy
    const trail = run.trail as { copy: Record<string, unknown> }
    const issue = { rule: 5, slot: first.slot, message: "A token names a fact on no selected page", hint: "Use a fact from this page" }
    const changed = { ...run, trail: { ...run.trail, copy: { ...trail.copy, fallbacks: [first.slot], issues: { [first.slot]: [issue], "archetype.id": [issue] } } } }
    const next = playgroundView(RECORDED_PREVIEW_ID, changed)!
    expect(next.copy[0]).toMatchObject({ slot: first.slot, outcome: "fallback", issues: [issue] })
    expect(next.otherIssues).toEqual([issue])
  })
})

describe("the recorded view the pane tests read", () => {
  // Rebuild with UPDATE_PLAYGROUND_VIEW=1 npx jest lib/rewind/playground
  it("is what playgroundView builds from the recorded run today", () => {
    const json = `${JSON.stringify(view, null, 2)}\n`
    if (process.env.UPDATE_PLAYGROUND_VIEW === "1") writeFileSync(RECORDED_VIEW_FILE, json)
    expect(readFileSync(RECORDED_VIEW_FILE, "utf8")).toBe(json)
  })
})

describe("diffAgainstStored", () => {
  it("is empty against itself", () => {
    expect(diffAgainstStored(run.data, run.data)).toEqual({ pagesAdded: [], pagesRemoved: [], factsChanged: false, slots: [] })
  })

  it("lists changed pages, facts and slot text", () => {
    const [first] = view.copy
    const decks = run.data.copy!.decks
    const deckKey = first.slot.startsWith("deck.") ? (first.slot.slice(5) as keyof typeof decks) : null
    const stored = {
      ...run.data,
      factsHash: "other",
      pages: run.data.pages.slice(0, -1),
      copy: deckKey ? { ...run.data.copy!, decks: { ...decks, [deckKey]: "Something else." } } : run.data.copy,
    }
    const diff = diffAgainstStored(run.data, stored)
    expect(diff.factsChanged).toBe(true)
    expect(diff.pagesAdded).toEqual([run.data.pages.at(-1)!.type])
    if (deckKey) expect(diff.slots).toContainEqual(expect.objectContaining({ slot: first.slot, before: "Something else." }))
  })
})
