import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { unzipSync } from "fflate"

import { SaveAll } from "@/components/rewind/share/save-all"
import { ShareProvider, type ShareActions } from "@/components/rewind/share/share-context"
import { RecordShareProvider } from "@/components/rewind/stage/use-record-view"
import { PortalContainerProvider } from "@/components/ui/portal-container"
import { ToastProvider } from "@/components/ui/toast"
import { eligibleCards } from "@/lib/rewind/cards/eligible"
import type { ShareSetup } from "@/lib/rewind/share-sheet"
import { fixtureRewind, shareContext } from "@/lib/wrapped/data/__tests__/share-fixture"
import { toShareSafe } from "@/lib/wrapped/data/share-safe"
import { SHARE_PAGE_TYPES } from "@/lib/rewind/page-meta"
import type { SharePageType } from "@/lib/wrapped/data/share-safe-schema"

jest.mock("server-only", () => ({}))

const ACTIONS = { enable: jest.fn(), rotate: jest.fn(), disable: jest.fn(), savePrefs: jest.fn().mockResolvedValue({ success: true, data: null }) } as ShareActions
const record = jest.fn()
let heavyCards: SharePageType[]
let zipped: Blob | null

beforeAll(async () => {
  const heavy = await fixtureRewind("heavy")
  const printed = SHARE_PAGE_TYPES.filter((type) => heavy.pages.some((page) => page.type === type))
  const shared = toShareSafe(heavy, { pages: printed, signed: false, includeArt: false, dailyDetail: true, cardFacts: [] }, shareContext())
  heavyCards = eligibleCards(shared, { dailyDetail: true })
})

const setupOf = (overrides: Partial<ShareSetup> = {}, dailyDetail = false): ShareSetup => ({
  rewindId: "wrapped-1",
  year: 2026,
  cards: heavyCards,
  artCards: [],
  allowArt: true,
  publicLinks: true,
  canShare: true,
  choices: { signed: false, includeArt: false, dailyDetail, cardFacts: [] },
  link: null,
  seasonCloses: "31 January 2027",
  dailyCards: heavyCards,
  folios: Object.fromEntries(heavyCards.map((card, i) => [card, i + 1])),
  cardFactOptions: [],
  cardFactDefaults: {},
  features: { editCard: false, saveAll: true },
  ...overrides,
})

function renderSaveAll(setup: ShareSetup) {
  return render(
    <PortalContainerProvider popupProps={{ "data-field": "paper" }}>
      <ToastProvider>
        <ShareProvider setup={setup} actions={ACTIONS}>
          <RecordShareProvider value={record}>
            <SaveAll />
          </RecordShareProvider>
        </ShareProvider>
      </ToastProvider>
    </PortalContainerProvider>
  )
}

const png = (url: string) => new TextEncoder().encode(`png:${url}`)

/** The downloaded ZIP's entries (jsdom's Blob has no `arrayBuffer`). */
function entries(blob: Blob): Promise<string[]> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(Object.keys(unzipSync(new Uint8Array(reader.result as ArrayBuffer))))
    reader.readAsArrayBuffer(blob)
  })
}
let failing: Set<string>
let gate: Promise<void> | null

beforeEach(() => {
  jest.clearAllMocks()
  failing = new Set()
  gate = null
  zipped = null
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (gate) await gate
    const ok = ![...failing].some((page) => url.includes(`/${page}?`))
    const bytes = png(url)
    return { ok, status: ok ? 200 : 500, headers: new Headers(), arrayBuffer: async () => bytes.buffer } as Response
  }) as typeof fetch
  URL.createObjectURL = jest.fn((blob: Blob) => {
    zipped = blob
    return "blob:zip"
  })
  URL.revokeObjectURL = jest.fn()
})

describe("Save all cards (P8.4)", () => {
  // The heavy fixture has no Guess page, so it has 14 and 15 cards; the design's mock member, with one, has 15 and 16 (P7.6).
  it("counts the heavy member's cards by Daily detail: 14 off, 15 on", () => {
    const { unmount } = renderSaveAll(setupOf())
    expect(screen.getByTestId("rewind-save-all")).toHaveTextContent("Save all 14 cards")
    unmount()
    renderSaveAll(setupOf({}, true))
    expect(screen.getByTestId("rewind-save-all")).toHaveTextContent("Save all 15 cards")
  })

  it("reads its progress politely, downloads one ZIP of every card and records one save", async () => {
    const user = userEvent.setup()
    let release: () => void = () => {}
    gate = new Promise((resolve) => (release = resolve))
    renderSaveAll(setupOf())
    await user.click(screen.getByTestId("rewind-save-all"))
    const progress = screen.getByTestId("rewind-save-all-progress")
    expect(progress).toHaveAttribute("aria-live", "polite")
    expect(progress).toHaveTextContent("Saving 1 of 14")
    expect(global.fetch).toHaveBeenCalledTimes(3)
    release()
    await waitFor(() => expect(zipped).not.toBeNull())
    const files = await entries(zipped!)
    expect(files).toHaveLength(14)
    expect(files).toContain("01-cover.png")
    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith("save")
  })

  it("keeps the rest when a card fails, with the partial toast", async () => {
    const user = userEvent.setup()
    failing.add("clock")
    renderSaveAll(setupOf())
    await user.click(screen.getByTestId("rewind-save-all"))
    expect(await screen.findByText("Saved 13 of 14 cards. Try again for the rest.")).toBeInTheDocument()
    expect(await entries(zipped!)).toHaveLength(13)
  })

  it("points a lapsed member to a membership instead", () => {
    renderSaveAll(setupOf({ canShare: false }))
    expect(screen.queryByTestId("rewind-save-all")).not.toBeInTheDocument()
    expect(screen.getByTestId("rewind-save-all-membership")).toHaveTextContent("Sharing needs an active membership")
    expect(screen.getByRole("link", { name: "See memberships" })).toHaveAttribute("href", "/subscribe")
  })

  it("renders nothing with the flag off", () => {
    renderSaveAll(setupOf({ features: { editCard: false, saveAll: false } }))
    expect(screen.queryByTestId("rewind-save-all")).not.toBeInTheDocument()
  })
})
