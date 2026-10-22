/**
 * The public share page (P0.11, P7.5: RWP-09, RWV-05, UI-16, UI-39). It
 * reads the database through `getShareSafeRewind` (real, on a mocked Prisma):
 *
 * - a v3 link renders only its published cards, from the asset-key route,
 *   in the Rewind scope on the first page's field, with "Shared by" from the
 *   projection, the owner banner for the owner and "Open your own Rewind"
 *   for any signed-in viewer;
 * - a surviving v2 token renders the stripped v2 summary as a paper article;
 * - each view records one visit in `after()`: v3 through `recordShareVisit`,
 *   v2 as a `WrappedShareVisit` row with the Rewind id only;
 * - `generateMetadata` sets noindex and the OG card by asset key, never the token.
 *
 * `headers()`, `after()` (run at once), `notFound()` and the session are mocked.
 */

import { render, screen, within } from "@testing-library/react"
import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"
import { notFound } from "next/navigation"
import { after } from "next/server"
import type { ReactElement } from "react"

import { buildConfig, buildPlexWrapped, buildRewindShare } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import SharedRewindPage, { generateMetadata } from "@/app/rewind/s/[token]/page"
import { ToastProvider } from "@/components/ui/toast"
import type { RewindShare } from "@/lib/generated/prisma/client"
import { fixtureRewind } from "@/lib/wrapped/data/__tests__/share-fixture"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { recordShareVisit } from "@/lib/wrapped/share/visit-counter"

jest.mock("next/headers", () => ({
  headers: jest.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.7" })),
}))

/** Work handed to `after()`, run at once so a test can await it. */
const afterTasks: Promise<unknown>[] = []
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: jest.fn((task: unknown) => {
    afterTasks.push(Promise.resolve(typeof task === "function" ? task() : task))
  }),
}))

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  useRouter: () => ({ refresh: jest.fn() }),
}))

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/settings/app-settings", () => ({
  getAppSettings: jest.fn().mockResolvedValue({ serverName: "Chester Family Plex", timeZone: "UTC", locale: "en-GB" }),
}))
jest.mock("@/lib/env", () => ({
  ...jest.requireActual("@/lib/env"),
  getBaseUrl: () => "https://plex.example.com",
}))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: () => true }))
jest.mock("@/lib/wrapped/share/visit-counter", () => ({ recordShareVisit: jest.fn().mockResolvedValue(true) }))
jest.mock("@/actions/rewind-sharing", () => ({ rotateRewindShare: jest.fn(), disableRewindShare: jest.fn() }))
jest.mock("@/actions/wrapped-share-link", () => ({ disableWrappedShareLink: jest.fn() }))

const mockLogError = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: (...args: unknown[]) => mockLogError(...args) }),
}))

const V3_TOKEN = "Kf-qkQFsJ4E6X_vMSKq1PiT624JyrVJtTNbepCgWYl8"
const V2_TOKEN = "vZ2bLJpJkqoegfJ4-9rodbBNhGs3XZ-sdNzNXJC96wI"
const ASSET_KEY = "Abcdefghijklmnopqrstuv"

let heavy: RewindDataV3

beforeAll(async () => {
  heavy = await fixtureRewind("heavy")
})

function liveShare(overrides: Partial<RewindShare> = {}) {
  prismaMock.rewindShare.findUnique.mockResolvedValue({
    ...buildRewindShare({ id: "share-1", assetKey: ASSET_KEY, pages: ["cover", "top-shows"], expiresAt: new Date("2027-01-31T23:59:59Z"), ...overrides }),
    wrapped: buildPlexWrapped({ id: "wrapped-1", userId: "owner-1", data: JSON.stringify(heavy), dataVersion: 3 }),
  } as never)
}

function v2Share() {
  prismaMock.plexWrapped.findUnique.mockResolvedValue({
    ...buildPlexWrapped({ id: "wrapped-2", userId: "owner-2", year: 2025 }),
    data: JSON.stringify({
      statistics: {
        totalWatchTime: { total: 6000 },
        moviesWatched: 12,
        showsWatched: 4,
        episodesWatched: 0,
        topMovies: [{ title: "Dune: Part Three", watchTime: 165, playCount: 1 }],
        topShows: [],
      },
    }),
    user: { name: "Mike" },
  } as never)
}

const params = (token: string) => ({ params: Promise.resolve({ token }) })

async function renderPage(token: string) {
  const page = (await SharedRewindPage(params(token))) as ReactElement
  return render(<ToastProvider>{page}</ToastProvider>)
}

async function settleAfterTasks() {
  await Promise.all(afterTasks.splice(0))
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  afterTasks.length = 0
  jest.mocked(getServerSession).mockResolvedValue(null)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ timezone: "UTC" }))
  prismaMock.rewindShare.findUnique.mockResolvedValue(null)
  prismaMock.plexWrapped.findUnique.mockResolvedValue(null)
  prismaMock.rewindPrefs.findUnique.mockResolvedValue(null)
  prismaMock.rewindExclusion.findMany.mockResolvedValue([])
  prismaMock.wrappedShareVisit.create.mockResolvedValue({} as never)
})

describe("a v3 link", () => {
  beforeEach(() => liveShare())

  it("shows only the published cards from the asset-key route, in the Rewind scope on the first page's field", async () => {
    await renderPage(V3_TOKEN)

    expect(screen.getByTestId("rewind-scope")).toHaveAttribute("data-theme", "rewind")
    expect(screen.getByRole("main")).toHaveAttribute("data-field")
    const cards = within(screen.getByTestId("rewind-share-cards")).getAllByRole("img")
    expect(cards.map((img) => img.getAttribute("src"))).toEqual([`/api/rewind/card/s/${ASSET_KEY}/cover`, `/api/rewind/card/s/${ASSET_KEY}/top-shows`])
    for (const img of cards) {
      expect(img).toHaveAttribute("width", "1080")
      expect(img).toHaveAttribute("height", "1920")
    }
    expect(cards[1].getAttribute("alt")).toMatch(/^Top shows card\. /)
    expect(document.body.innerHTML).not.toContain(V3_TOKEN)
  })

  it("names the server, not the member, on an unsigned link, and offers no owner controls to a visitor", async () => {
    await renderPage(V3_TOKEN)

    expect(screen.getByTestId("rewind-share-masthead")).toHaveTextContent("Chester Family Plex Rewind 2026")
    expect(screen.getByTestId("rewind-share-byline")).toHaveTextContent("Shared by a member of Chester Family Plex")
    expect(screen.queryByTestId("rewind-share-owner-banner")).not.toBeInTheDocument()
    expect(screen.queryByTestId("rewind-share-open-own")).not.toBeInTheDocument()
    const first = heavy.facts["member.firstName"]?.display
    if (first) expect(document.body.textContent).not.toMatch(new RegExp(`\\b${first}\\b`))
  })

  it("says who shared it only when signed, and 'Shared from Rewind 2026' without a brand", async () => {
    liveShare({ signed: true })
    await renderPage(V3_TOKEN)
    expect(screen.getByTestId("rewind-share-byline")).toHaveTextContent(`Shared by ${heavy.facts["member.firstName"]?.display}`)
  })

  it("gives the owner the banner, and any signed-in viewer 'Open your own Rewind'", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "owner-1" } } as never)
    await renderPage(V3_TOKEN)

    const banner = screen.getByTestId("rewind-share-owner-banner")
    expect(banner).toHaveTextContent("This page is public until 31 Jan 2027.")
    expect(within(banner).getByTestId("rewind-share-change-cards")).toHaveAttribute("href", "/rewind/2026?sheet=share")
    expect(within(banner).getByTestId("rewind-share-rotate")).toHaveTextContent("Rotate link")
    expect(within(banner).getByTestId("rewind-share-stop-sharing")).toHaveTextContent("Stop sharing")
    expect(screen.getByTestId("rewind-share-open-own")).toHaveAttribute("href", "/rewind")
  })

  it("shows another member no banner", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "friend-1" } } as never)
    await renderPage(V3_TOKEN)
    expect(screen.queryByTestId("rewind-share-owner-banner")).not.toBeInTheDocument()
    expect(screen.getByTestId("rewind-share-open-own")).toBeInTheDocument()
  })

  it("records one visit per view through the visit counter, by share id and address", async () => {
    for (let view = 0; view < 3; view++) {
      await generateMetadata(params(V3_TOKEN))
      const { unmount } = await renderPage(V3_TOKEN)
      unmount()
    }
    await settleAfterTasks()

    expect(after).toHaveBeenCalledTimes(3)
    expect(recordShareVisit).toHaveBeenCalledTimes(3)
    expect(recordShareVisit).toHaveBeenCalledWith("share-1", "203.0.113.7")
    expect(prismaMock.wrappedShareVisit.create).not.toHaveBeenCalled()
  })

  it("logs a failed visit instead of failing the page", async () => {
    jest.mocked(recordShareVisit).mockRejectedValueOnce(new Error("Redis down"))
    await renderPage(V3_TOKEN)
    await settleAfterTasks()
    expect(screen.getByTestId("rewind-share-cards")).toBeInTheDocument()
    expect(mockLogError).toHaveBeenCalledWith("Failed to record the share visit", expect.any(Error), { requestId: null })
  })

  it("sets noindex, ogText and the OG card of the first published page by asset key", async () => {
    const metadata = await generateMetadata(params(V3_TOKEN))
    const og = `https://plex.example.com/api/rewind/card/s/${ASSET_KEY}/cover?size=og`

    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.title).toBe("Chester Family Plex Rewind 2026")
    expect(metadata.description).toMatch(/^Chester Family Plex Rewind 2026: /)
    expect(metadata.openGraph?.images).toEqual([expect.objectContaining({ url: og, width: 1200, height: 630 })])
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", images: [og] })
    expect(JSON.stringify(metadata)).not.toContain(V3_TOKEN)
  })

  it("points the OG card at the centrefold when it is published", async () => {
    liveShare({ pages: ["cover", "centrefold"] })
    const metadata = await generateMetadata(params(V3_TOKEN))
    expect(metadata.openGraph?.images).toEqual([expect.objectContaining({ url: expect.stringMatching(/\/centrefold\?size=og$/) })])
  })

  it("names the owner in the title only when signed", async () => {
    liveShare({ signed: true })
    const metadata = await generateMetadata(params(V3_TOKEN))
    expect(metadata.title).toBe(`${heavy.facts["member.firstName"]?.display}’s Rewind 2026`)
  })
})

describe("a surviving v2 token", () => {
  beforeEach(() => v2Share())

  it("renders the stripped summary as a paper article, without cards", async () => {
    await renderPage(V2_TOKEN)

    const article = screen.getByTestId("rewind-share-v2")
    expect(article).toHaveTextContent("Mike’s Rewind 2025")
    expect(screen.getByTestId("rewind-share-v2-totals")).toHaveTextContent("100 h")
    expect(screen.getByTestId("rewind-share-v2-totals")).not.toHaveTextContent("episode")
    expect(screen.getByTestId("rewind-share-v2-films")).toHaveTextContent("Dune: Part Three")
    expect(screen.queryByTestId("rewind-share-cards")).not.toBeInTheDocument()
  })

  it("offers its owner only Stop sharing", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "owner-2" } } as never)
    await renderPage(V2_TOKEN)

    const banner = screen.getByTestId("rewind-share-owner-banner")
    expect(within(banner).getByTestId("rewind-share-stop-sharing")).toBeInTheDocument()
    expect(within(banner).queryByTestId("rewind-share-rotate")).not.toBeInTheDocument()
    expect(within(banner).queryByTestId("rewind-share-change-cards")).not.toBeInTheDocument()
  })

  it("records one WrappedShareVisit per view, with the Rewind id only", async () => {
    await renderPage(V2_TOKEN)
    await settleAfterTasks()
    expect(prismaMock.wrappedShareVisit.create).toHaveBeenCalledWith({ data: { wrappedId: "wrapped-2" } })
    expect(recordShareVisit).not.toHaveBeenCalled()
  })

  it("keeps the app's default OG image: no image URL carries the token", async () => {
    const metadata = await generateMetadata(params(V2_TOKEN))
    expect(metadata).toEqual({ title: "Rewind 2025", robots: { index: false, follow: false } })
  })
})

describe("a token that shares nothing", () => {
  it("calls notFound and records nothing", async () => {
    await expect(renderPage(V3_TOKEN)).rejects.toThrow("NEXT_NOT_FOUND")
    expect(notFound).toHaveBeenCalledTimes(1)
    expect(after).not.toHaveBeenCalled()
  })

  it("calls notFound for a malformed token without a database call", async () => {
    await expect(renderPage("bad-token")).rejects.toThrow("NEXT_NOT_FOUND")
    expect(prismaMock.rewindShare.findUnique).not.toHaveBeenCalled()
  })

  it("gets a neutral title with noindex", async () => {
    expect(await generateMetadata(params(V3_TOKEN))).toEqual({ title: "Rewind", robots: { index: false, follow: false } })
  })
})
