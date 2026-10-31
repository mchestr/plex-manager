import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ShareProvider, type ShareActions } from "@/components/rewind/share/share-context"
import { ShareSheet } from "@/components/rewind/share/share-sheet"
import { PortalContainerProvider } from "@/components/ui/portal-container"
import { ToastProvider } from "@/components/ui/toast"
import type { IssuePageType } from "@/lib/rewind/registry"
import type { ShareSetup } from "@/lib/rewind/share-sheet"

const enableRewindShare = jest.fn()
const saveRewindSharePrefs = jest.fn()
const disableRewindShare = jest.fn()
const ACTIONS = { enable: enableRewindShare, rotate: jest.fn(), disable: disableRewindShare, savePrefs: saveRewindSharePrefs } as ShareActions

const SETUP: ShareSetup = {
  rewindId: "wrapped-1",
  year: 2026,
  cards: ["cover", "number", "top-shows", "clock", "back-cover"],
  artCards: ["top-shows", "back-cover"],
  allowArt: true,
  publicLinks: true,
  canShare: true,
  choices: { signed: false, includeArt: false, dailyDetail: false, cardFacts: [] },
  link: null,
  seasonCloses: "31 January 2027",
  dailyCards: ["cover", "number", "top-shows", "clock", "back-cover"],
  folios: {},
  cardFactOptions: [],
  cardFactDefaults: {},
  features: { editCard: false, saveAll: false },
}

const fetchMock = jest.fn()

function setNavigator(props: Record<string, unknown>) {
  for (const [key, value] of Object.entries(props)) Object.defineProperty(window.navigator, key, { value, configurable: true, writable: true })
}

function renderSheet({ setup = SETUP, page = "top-shows" as IssuePageType } = {}) {
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

const preview = () => screen.getByTestId("rewind-share-preview")

beforeEach(() => {
  jest.clearAllMocks()
  saveRewindSharePrefs.mockResolvedValue({ success: true, data: null })
  fetchMock.mockImplementation(async () => ({ ok: true, blob: async () => new Blob(["png"], { type: "image/png" }) }))
  global.fetch = fetchMock
  URL.createObjectURL = jest.fn(() => "blob:card")
  URL.revokeObjectURL = jest.fn()
  setNavigator({ share: undefined, canShare: undefined, clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } })
})

describe("ShareSheet", () => {
  it("previews the owner card for the current page, and the switches change the preview", async () => {
    const user = userEvent.setup()
    renderSheet()
    expect(preview()).toHaveAttribute("src", "/api/rewind/card/wrapped-1/top-shows?signed=0&art=0&daily=0")
    expect(screen.getByText("Story card, 1080 by 1920")).toBeInTheDocument()

    await user.click(screen.getByTestId("rewind-share-sign"))
    await user.click(screen.getByTestId("rewind-share-art"))
    expect(preview()).toHaveAttribute("src", "/api/rewind/card/wrapped-1/top-shows?signed=1&art=1&daily=0")
    expect(saveRewindSharePrefs).toHaveBeenLastCalledWith({ year: 2026, signed: true, includeArt: true, dailyDetail: false, cardFacts: [] })
  })

  it("offers artwork only on a page with posters while the admin allows it", () => {
    renderSheet({ page: "clock" })
    expect(screen.queryByTestId("rewind-share-art")).not.toBeInTheDocument()
  })

  it("shows only Save image and Copy link without file sharing", () => {
    renderSheet()
    expect(screen.queryByTestId("rewind-share-image")).not.toBeInTheDocument()
    expect(screen.getByTestId("rewind-share-save")).toBeInTheDocument()
    expect(screen.getByTestId("rewind-share-copy-link")).toHaveTextContent("Create a public link")
  })

  it("has the File ready before the tap, and shares the files only", async () => {
    const share = jest.fn().mockResolvedValue(undefined)
    setNavigator({ canShare: () => true, share })
    const user = userEvent.setup()
    renderSheet()
    await waitFor(() => expect(screen.getByTestId("rewind-share-image")).toBeEnabled())
    expect(fetchMock).toHaveBeenCalledWith("/api/rewind/card/wrapped-1/top-shows?signed=0&art=0&daily=0", expect.anything())

    await user.click(screen.getByTestId("rewind-share-image"))
    expect(share).toHaveBeenCalledTimes(1)
    const [data] = share.mock.calls[0] as [ShareData]
    expect(Object.keys(data).sort()).toEqual(["files", "title"])
    expect(data.title).toBe("My Rewind 2026")
    expect(data.files?.[0]).toBeInstanceOf(File)
    expect(data.files?.[0].name).toBe("rewind-2026-top-shows.png")
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it("falls back to Save when sharing fails, and stays silent when it is dismissed", async () => {
    const share = jest.fn().mockRejectedValueOnce(new DOMException("dismissed", "AbortError")).mockRejectedValueOnce(new Error("no"))
    setNavigator({ canShare: () => true, share })
    const user = userEvent.setup()
    renderSheet()
    await waitFor(() => expect(screen.getByTestId("rewind-share-image")).toBeEnabled())

    await user.click(screen.getByTestId("rewind-share-image"))
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    await user.click(screen.getByTestId("rewind-share-image"))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it("names the card count, the name state and the expiry before creating a link", async () => {
    enableRewindShare.mockResolvedValue({ success: true, data: { shareId: "share-1", url: "https://plex.example.com/rewind/s/abc", expiresAt: null } })
    const user = userEvent.setup()
    renderSheet()
    await user.click(screen.getByTestId("rewind-share-copy-link"))
    const confirm = screen.getByTestId("rewind-share-confirm")
    expect(within(confirm).getByTestId("rewind-share-confirm-line")).toHaveTextContent(
      "Anyone with the link will see these 5 cards, without your name, until 31 January 2027."
    )
    await user.click(within(confirm).getByTestId("rewind-share-no-expiry"))
    expect(within(confirm).getByTestId("rewind-share-confirm-line")).toHaveTextContent("until you stop sharing.")

    await user.click(within(confirm).getByTestId("rewind-share-create"))
    expect(enableRewindShare).toHaveBeenCalledWith({
      year: 2026,
      pages: SETUP.cards,
      signed: false,
      includeArt: false,
      dailyDetail: false,
      cardFacts: [],
      expiresAt: "never",
    })
    expect(await screen.findByTestId("rewind-share-url")).toHaveTextContent("https://plex.example.com/rewind/s/abc")
    expect(await navigator.clipboard.readText()).toBe("https://plex.example.com/rewind/s/abc")
    expect(screen.getByTestId("rewind-share-copy-link")).toHaveTextContent("Copy link")
  })

  it("stops a live link", async () => {
    disableRewindShare.mockResolvedValue({ success: true, data: null })
    const user = userEvent.setup()
    renderSheet({ setup: { ...SETUP, link: { shareId: "share-1", pages: ["cover"], expiresAt: null } } })
    expect(screen.getByTestId("rewind-share-copy-link")).toHaveTextContent("Copy a new link")
    await user.click(screen.getByTestId("rewind-share-stop"))
    expect(disableRewindShare).toHaveBeenCalledWith({ shareId: "share-1" })
    await waitFor(() => expect(screen.getByTestId("rewind-share-copy-link")).toHaveTextContent("Create a public link"))
    expect(screen.queryByTestId("rewind-share-stop")).not.toBeInTheDocument()
  })

  it("tells a lapsed member that sharing needs a membership", () => {
    renderSheet({ setup: { ...SETUP, canShare: false } })
    expect(screen.getByTestId("rewind-share-membership")).toHaveTextContent("Sharing needs an active membership")
    expect(within(screen.getByTestId("rewind-share-membership")).getByRole("link")).toHaveAttribute("href", "/subscribe")
    expect(screen.queryByTestId("rewind-share-preview")).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("prints the privacy line", () => {
    renderSheet()
    expect(screen.getByTestId("rewind-share-privacy")).toHaveTextContent("Cards never show other members. Server admins can view your Rewind.")
  })
})
