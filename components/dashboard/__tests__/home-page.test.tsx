/**
 * Home places the Leaving soon row (UX 9.3, TS 13.5) after the RewindCard
 * and before the New on row, with the member's id, the server name and the
 * format, in its own Suspense boundary with its skeleton: a row that waits
 * never holds up the rest of Home.
 */

import { act, render, screen } from "@testing-library/react"

import { HomePage } from "@/components/dashboard/home-page"
import { LeavingSoonRow } from "@/components/dashboard/leaving-soon-row"
import { requestRewindCardModel, type RewindCardModel } from "@/lib/rewind/home-card"

// The row shows a stub, suspends on a promise that never settles, or renders nothing
const mockRow = { mode: "row" as "row" | "suspend" | "empty", never: new Promise<never>(() => {}) }

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/member/home-data", () => ({
  getHomeData: jest.fn(async () => ({
    serverName: "Northfield Plex",
    greeting: "Good evening, Morgan",
    service: "plex",
    announcements: [],
    announcementsSeenAt: null,
    quickLinks: { media: [{ service: "plex", serverName: "Northfield Plex", url: null }], requestsUrl: null, discord: null },
    watchlist: null,
    hasSubscription: false,
    supportChannelUrl: null,
    format: { timeZone: "UTC", locale: "en-US" },
  })),
}))
jest.mock("@/lib/rewind/home-card", () => ({ requestRewindCardModel: jest.fn() }))
jest.mock("@/components/dashboard/rewind-card", () => ({ RewindCard: () => <div data-testid="rewind-card-stub" /> }))
jest.mock("@/components/dashboard/new-on-row", () => ({
  NewOnRow: () => <div data-testid="new-on-stub" />,
  NewOnRowSkeleton: () => <div data-testid="new-on-skeleton-stub" />,
}))
jest.mock("@/components/dashboard/leaving-soon-row", () => ({
  LeavingSoonRow: jest.fn(() => {
    if (mockRow.mode === "suspend") jest.requireActual<typeof import("react")>("react").use(mockRow.never)
    return mockRow.mode === "empty" ? null : <div data-testid="leaving-soon-row-stub" />
  }),
  LeavingSoonRowSkeleton: () => <div data-testid="leaving-soon-skeleton-stub" />,
}))
jest.mock("@/components/dashboard/quick-links", () => ({ QuickLinks: () => null }))
jest.mock("@/components/dashboard/request-limits", () => ({ RequestLimits: () => null }))
jest.mock("@/components/dashboard/help-card", () => ({ HelpCard: () => null }))
jest.mock("@/components/watchlist/sync-settings-card", () => ({ WatchlistSyncCard: () => null }))

const MODEL: RewindCardModel = {
  state: { kind: "not-started", year: 2026 },
  archive: [],
  name: "Northfield Plex Rewind 2026",
  settings: { timeZone: "UTC", locale: "en-US" },
}

async function renderHome() {
  const home = await HomePage({ userId: "member-1", isAdmin: false })
  await act(async () => {
    render(home)
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRow.mode = "row"
  jest.mocked(requestRewindCardModel).mockResolvedValue(MODEL)
})

describe("HomePage Leaving soon row", () => {
  it("comes after the RewindCard and before the New on row, with the member, the server name and the format", async () => {
    await renderHome()

    const [rewind, leaving, newOn] = ["rewind-card-stub", "leaving-soon-row-stub", "new-on-stub"].map((id) => screen.getByTestId(id))
    expect(rewind.compareDocumentPosition(leaving) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(leaving.compareDocumentPosition(newOn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(jest.mocked(LeavingSoonRow).mock.calls[0][0]).toEqual({ userId: "member-1", serverName: "Northfield Plex", format: { timeZone: "UTC", locale: "en-US" } })
  })

  it("streams the row behind its own skeleton, while the rest of Home shows", async () => {
    mockRow.mode = "suspend"
    await renderHome()

    expect(screen.getByTestId("leaving-soon-skeleton-stub")).toBeInTheDocument()
    expect(screen.queryByTestId("leaving-soon-row-stub")).not.toBeInTheDocument()
    expect(screen.getByTestId("new-on-stub")).toBeInTheDocument()
    expect(screen.getByTestId("rewind-card-stub")).toBeInTheDocument()
  })

  it("hides its slot when the row renders nothing", async () => {
    mockRow.mode = "empty"
    await renderHome()

    const slot = screen.getByTestId("rewind-card-stub").parentElement?.nextElementSibling
    expect(slot).toBeEmptyDOMElement()
    expect(slot).toHaveClass("empty:hidden")
  })
})
