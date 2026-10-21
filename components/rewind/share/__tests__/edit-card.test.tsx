import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ShareProvider, type ShareActions } from "@/components/rewind/share/share-context"
import { ShareSheet } from "@/components/rewind/share/share-sheet"
import { PortalContainerProvider } from "@/components/ui/portal-container"
import { ToastProvider } from "@/components/ui/toast"
import type { IssuePageType } from "@/lib/rewind/registry"
import type { ShareSetup } from "@/lib/rewind/share-sheet"
import { fixtureRewind, shareContext } from "@/lib/wrapped/data/__tests__/share-fixture"
import { cardFactOptions } from "@/lib/wrapped/data/share-safe"
import { CARD_FACT_IDS, type CardFactId } from "@/lib/wrapped/data/share-safe-schema"

const savePrefs = jest.fn()
const update = jest.fn()
const ACTIONS = { enable: jest.fn(), rotate: jest.fn(), disable: jest.fn(), savePrefs, update } as ShareActions

const OPTIONS: CardFactId[] = CARD_FACT_IDS.filter((id) => id !== "standing.percentile")

const setupOf = (overrides: Partial<ShareSetup> = {}): ShareSetup => ({
  rewindId: "wrapped-1",
  year: 2026,
  cards: ["cover", "clock", "centrefold", "back-cover"],
  artCards: ["back-cover"],
  allowArt: true,
  publicLinks: true,
  canShare: true,
  choices: { signed: false, includeArt: false, dailyDetail: false, cardFacts: [] },
  link: null,
  seasonCloses: "31 January 2027",
  dailyCards: ["cover", "clock", "centrefold", "back-cover"],
  folios: {},
  cardFactOptions: OPTIONS,
  cardFactDefaults: { centrefold: ["time.totalHours", "streak.longest.days", "time.seriesHours"] },
  features: { editCard: true, saveAll: false },
  ...overrides,
})

function renderSheet(setup: ShareSetup, page: IssuePageType = "centrefold") {
  return render(
    <PortalContainerProvider popupProps={{ "data-field": "paper" }}>
      <ToastProvider>
        <ShareProvider setup={setup} actions={ACTIONS}>
          <ShareSheet open onClose={jest.fn()} page={page} atSettings={false} />
        </ShareProvider>
      </ToastProvider>
    </PortalContainerProvider>
  )
}

const box = (id: CardFactId) => screen.getByTestId(`rewind-edit-card-${id}`)

beforeEach(() => {
  jest.clearAllMocks()
  savePrefs.mockResolvedValue({ success: true, data: null })
  update.mockResolvedValue({ success: true, data: { shareId: "share-1", expiresAt: null } })
  // The card preview file never arrives: these tests read the URL only.
  global.fetch = jest.fn(() => new Promise<Response>(() => {}))
  URL.createObjectURL = jest.fn(() => "blob:card")
  URL.revokeObjectURL = jest.fn()
})

describe("Edit card (P8.4)", () => {
  it("starts from the poster's defaults and disables a fourth box", async () => {
    renderSheet(setupOf())
    const group = await screen.findByRole("group", { name: "Three stats on the poster" })
    expect(group).toHaveAccessibleDescription("Choose three")
    expect(within(group).getAllByRole("checkbox")).toHaveLength(OPTIONS.length)
    expect(box("time.totalHours")).toHaveAttribute("aria-checked", "true")
    expect(box("counts.films")).toHaveAttribute("aria-disabled", "true")
  })

  it("sends the choice to the preview URL, the prefs and a live link", async () => {
    const user = userEvent.setup()
    renderSheet(setupOf({ link: { shareId: "share-1", pages: ["centrefold"], expiresAt: null } }))
    await screen.findByTestId("rewind-edit-card")
    await user.click(box("time.seriesHours"))
    expect(savePrefs).toHaveBeenLastCalledWith(expect.objectContaining({ cardFacts: ["time.totalHours", "streak.longest.days"] }))
    expect(update).not.toHaveBeenCalled()
    await user.click(box("counts.films"))
    expect(savePrefs).toHaveBeenLastCalledWith(expect.objectContaining({ cardFacts: ["time.totalHours", "counts.films", "streak.longest.days"] }))
    expect(update).toHaveBeenCalledWith({ shareId: "share-1", cardFacts: ["time.totalHours", "counts.films", "streak.longest.days"] })
    expect(screen.getByTestId("rewind-share-preview").getAttribute("src")).toContain("facts=time.totalHours%2Ccounts.films%2Cstreak.longest.days")
  })

  it("shows only on the centrefold and back cover, and not with the flag off", async () => {
    const { unmount } = renderSheet(setupOf(), "clock")
    await screen.findByTestId("rewind-share-preview")
    expect(screen.queryByTestId("rewind-edit-card")).not.toBeInTheDocument()
    unmount()
    renderSheet(setupOf({ features: { editCard: false, saveAll: false } }))
    expect(screen.queryByTestId("rewind-edit-card")).not.toBeInTheDocument()
  })
})

describe("cardFactOptions", () => {
  it("offers the percentile only at top 25% or better", async () => {
    const heavy = await fixtureRewind("heavy")
    const at = (value: number) => ({ ...heavy, facts: { ...heavy.facts, "standing.percentile": { value, display: `Top ${value}%`, unit: "percentile" as const } } })
    expect(cardFactOptions(at(25), shareContext())).toContain("standing.percentile")
    expect(cardFactOptions(at(26), shareContext())).not.toContain("standing.percentile")
  })
})
