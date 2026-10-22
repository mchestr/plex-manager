/**
 * The share page's owner banner (P7.5, design 6.6): Change cards, and Rotate
 * link and Stop sharing behind confirm steps. Rotate shows the new address
 * once; a v2 link offers only Stop sharing.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { disableRewindShare, rotateRewindShare } from "@/actions/rewind-sharing"
import { disableWrappedShareLink } from "@/actions/wrapped-share-link"
import { OwnerBanner } from "@/components/rewind/share/owner-banner"
import { ToastProvider } from "@/components/ui/toast"

const refresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))
jest.mock("@/actions/rewind-sharing", () => ({ rotateRewindShare: jest.fn(), disableRewindShare: jest.fn() }))
jest.mock("@/actions/wrapped-share-link", () => ({ disableWrappedShareLink: jest.fn() }))

const NEW_URL = "https://plex.example.com/rewind/s/new-token"

function renderBanner(props: Parameters<typeof OwnerBanner>[0]) {
  return render(
    <ToastProvider>
      <OwnerBanner {...props} />
    </ToastProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("OwnerBanner", () => {
  it("says until when the page is public, and links Change cards to the share sheet", () => {
    renderBanner({ kind: "v3", shareId: "share-1", year: 2026, publicUntil: "31 Jan 2027" })

    expect(screen.getByTestId("rewind-share-owner-until")).toHaveTextContent("This page is public until 31 Jan 2027.")
    expect(screen.getByTestId("rewind-share-change-cards")).toHaveAttribute("href", "/rewind/2026?sheet=share")
  })

  it("reads differently for a link with no expiry", () => {
    renderBanner({ kind: "v3", shareId: "share-1", year: 2026, publicUntil: null })
    expect(screen.getByTestId("rewind-share-owner-until")).toHaveTextContent("This page is public until you stop sharing it.")
  })

  it("rotates after the confirm step and shows the new address once", async () => {
    const user = userEvent.setup()
    jest.mocked(rotateRewindShare).mockResolvedValue({ success: true, data: { shareId: "share-2", url: NEW_URL, expiresAt: null } })
    renderBanner({ kind: "v3", shareId: "share-1", year: 2026, publicUntil: "31 Jan 2027" })

    await user.click(screen.getByTestId("rewind-share-rotate"))
    expect(rotateRewindShare).not.toHaveBeenCalled()
    await user.click(await screen.findByTestId("rewind-share-rotate-confirm"))

    expect(rotateRewindShare).toHaveBeenCalledWith({ shareId: "share-1" })
    expect(await screen.findByTestId("rewind-share-new-url")).toHaveTextContent(NEW_URL)
    expect(screen.getByTestId("rewind-share-new-url-copy")).toBeInTheDocument()
  })

  it("keeps the dialog open with the error when rotating fails", async () => {
    const user = userEvent.setup()
    jest.mocked(rotateRewindShare).mockResolvedValue({ success: false, code: "CONFLICT", error: "That link just changed. Refresh and try again." })
    renderBanner({ kind: "v3", shareId: "share-1", year: 2026, publicUntil: null })

    await user.click(screen.getByTestId("rewind-share-rotate"))
    await user.click(await screen.findByTestId("rewind-share-rotate-confirm"))

    expect(await screen.findByText("That link just changed. Refresh and try again.")).toBeInTheDocument()
    expect(screen.queryByTestId("rewind-share-new-url")).not.toBeInTheDocument()
  })

  it("stops a v3 link and refreshes the page", async () => {
    const user = userEvent.setup()
    jest.mocked(disableRewindShare).mockResolvedValue({ success: true, data: null })
    renderBanner({ kind: "v3", shareId: "share-1", year: 2026, publicUntil: null })

    await user.click(screen.getByTestId("rewind-share-stop-sharing"))
    await user.click(await screen.findByTestId("rewind-share-stop-confirm"))

    expect(disableRewindShare).toHaveBeenCalledWith({ shareId: "share-1" })
    expect(await screen.findByText("This page is no longer shared.")).toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()
  })

  it("offers a v2 link only Stop sharing, through the v2 action", async () => {
    const user = userEvent.setup()
    jest.mocked(disableWrappedShareLink).mockResolvedValue({ success: true, data: null })
    renderBanner({ kind: "v2", year: 2025, publicUntil: null })

    expect(screen.queryByTestId("rewind-share-rotate")).not.toBeInTheDocument()
    expect(screen.queryByTestId("rewind-share-change-cards")).not.toBeInTheDocument()
    await user.click(screen.getByTestId("rewind-share-stop-sharing"))
    await user.click(await screen.findByTestId("rewind-share-stop-confirm"))

    expect(disableWrappedShareLink).toHaveBeenCalledWith({ year: 2025 })
  })
})
