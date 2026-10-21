/**
 * `/admin/rewind/gallery` (P7.11): five fixture tabs; a completed dry run of
 * the tab's fixture shows one settled story frame per selected page and one
 * preview card per eligible card; otherwise the tab starts or reuses a dry
 * run. Non-admins get a 404.
 */

import { render, screen, within } from "@testing-library/react"
import { notFound } from "next/navigation"

import RewindGalleryPage from "@/app/admin/rewind/gallery/page"
import { GalleryRun } from "@/components/admin/rewind/gallery/gallery-run"
import { getAdminGate } from "@/lib/admin"
import { selectedReplay } from "@/lib/llm/replay"
import { eligibleCards } from "@/lib/rewind/cards/eligible"
import { pagesForCut } from "@/lib/rewind/editions"
import { validatePagesOnRead } from "@/lib/rewind/select-pages"
import { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { toShareSafe } from "@/lib/wrapped/data/share-safe"
import { SharePageTypeSchema, type SharePageType } from "@/lib/wrapped/data/share-safe-schema"
import heavy from "@/e2e/fixtures/rewind/heavy.v3.json"

jest.mock("@/lib/admin", () => ({ getAdminGate: jest.fn() }))
const mockShareCtx = { userId: "fixture", serverName: "Northfield", showServerName: true, publicCounts: false, allowArt: true, hiddenKeys: new Set<string>(), exclusionsVersion: 0 }
jest.mock("@/lib/wrapped/data/share-context", () => ({ loadShareContext: async () => mockShareCtx }))
jest.mock("@/lib/llm/replay", () => ({ selectedReplay: jest.fn() }))
jest.mock("@/lib/prisma", () => ({ prisma: { config: { findUnique: async () => ({ rewindDisabledPages: [] }) } } }))
jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))
const mockGet = jest.fn()
jest.mock("@/lib/queue/connection", () => ({ getRequestPathRedis: () => ({ get: mockGet }) }))
jest.mock("@/components/admin/rewind/gallery/gallery-run", () => ({ GalleryRun: jest.fn(() => <p data-testid="gallery-run" />) }))

const ID = "0b6c1f7e-3c1a-4f7e-9d0a-2f4b8c6d1e3a"
const data = RewindDataV3.parse(heavy)

const stored = (fixtureId: string) => ({
  status: "completed",
  subject: { kind: "fixture", fixtureId },
  year: 2026,
  adminId: "admin-1",
  finishedAt: "2026-11-20T10:00:00.000Z",
  data,
  trail: {},
})

async function renderPage(query: Record<string, string> = {}) {
  render(await RewindGalleryPage({ searchParams: Promise.resolve(query) }))
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getAdminGate).mockResolvedValue({ ok: true, session: { user: { id: "admin-1", isAdmin: true } } } as never)
  jest.mocked(selectedReplay).mockReturnValue(null)
  mockGet.mockImplementation(async (key: string) => (key === `rw:preview:${ID}` ? JSON.stringify(stored("heavy")) : null))
})

it("refuses non-admins", async () => {
  jest.mocked(getAdminGate).mockResolvedValue({ ok: false, reason: "forbidden" })
  await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND")
  expect(notFound).toHaveBeenCalled()
})

it("has a tab for each of the five review fixtures, the current one marked", async () => {
  await renderPage({ fixture: "postcard" })
  const tabs = within(screen.getByRole("navigation", { name: "Review fixtures" })).getAllByRole("link")
  expect(tabs.map((tab) => tab.getAttribute("data-testid"))).toEqual(
    ["heavy", "median", "light", "postcard", "extreme"].map((id) => `rewind-gallery-tab-${id}`)
  )
  expect(screen.getByTestId("rewind-gallery-tab-postcard")).toHaveAttribute("aria-current", "page")
})

it("shows one settled frame per selected page and one image per eligible card", async () => {
  await renderPage({ fixture: "heavy", preview: ID })
  const pages = validatePagesOnRead(pagesForCut(data, "full"), { archetype: data.archetype?.id ?? null, disabledPages: [] })
  const frames = screen.getAllByTestId("rewind-gallery-page")
  expect(frames).toHaveLength(pages.length)
  frames.forEach((frame, i) => {
    const src = new URL(frame.querySelector("iframe")?.getAttribute("src") ?? "", "http://x")
    expect(src.pathname).toBe("/rewind/2026")
    expect(Object.fromEntries(src.searchParams)).toEqual({ preview: ID, page: pages[i].type, still: "1" })
  })

  const printed = pages.map((page) => page.type).filter((type): type is SharePageType => SharePageTypeSchema.safeParse(type).success)
  const cards = eligibleCards(toShareSafe(data, { pages: printed, signed: false, includeArt: false, dailyDetail: true, cardFacts: [] }, mockShareCtx), { dailyDetail: true })
  expect(cards.length).toBeGreaterThan(0)
  expect(screen.getAllByTestId("rewind-gallery-card").map((card) => card.querySelector("img")?.getAttribute("src"))).toEqual(
    cards.map((card) => `/api/rewind/card/preview/${ID}/${card}?daily=1`)
  )
  expect(GalleryRun).not.toHaveBeenCalled()
})

it("starts a Templates-only run until a model is selected", async () => {
  await renderPage({ fixture: "median", copy: "selected" })
  expect(screen.getByTestId("rewind-gallery-no-selection")).toBeInTheDocument()
  expect(screen.queryByTestId("rewind-gallery-copy-selected")).not.toBeInTheDocument()
  expect(jest.mocked(GalleryRun).mock.calls[0][0]).toEqual({
    runKey: "median:templates",
    input: { subject: { kind: "fixture", fixtureId: "median" }, year: 2026, copyPolicy: "no-llm" },
  })
})

it("replays the selected model by default once there is one, and ignores another fixture's preview", async () => {
  jest.mocked(selectedReplay).mockReturnValue({ model: { provider: "anthropic", id: "claude-sonnet-5-5" }, set: "anthropic-claude-sonnet-5-5" })
  await renderPage({ fixture: "extreme", preview: ID })
  expect(screen.queryByTestId("rewind-gallery-ready")).not.toBeInTheDocument()
  expect(screen.getByTestId("rewind-gallery-copy-selected")).toHaveAttribute("aria-current", "page")
  expect(jest.mocked(GalleryRun).mock.calls[0][0]).toEqual({
    runKey: "extreme:selected",
    input: { subject: { kind: "fixture", fixtureId: "extreme" }, year: 2026, model: "replay:selected" },
  })
})
