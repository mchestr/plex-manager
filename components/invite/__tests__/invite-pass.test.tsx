/**
 * The InvitePass (P10.26, ui-design-system 6.6): the stub fields, the accept
 * islands, the voided states and the admin preview.
 */

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { InvitePass, type InvitePassProps } from "@/components/invite/invite-pass"
import { startPlexSignIn } from "@/lib/plex-auth"
import { redirectTo } from "@/lib/utils/navigation"

expect.extend(toHaveNoViolations)

jest.mock("@/lib/plex-auth", () => ({ startPlexSignIn: jest.fn() }))
jest.mock("@/lib/utils/navigation", () => ({ redirectTo: jest.fn() }))
jest.mock("@/actions/invite", () => ({ redeemJellyfinInviteForm: jest.fn() }))

const VALID: InvitePassProps = {
  state: "valid",
  code: "NORTH7Q2",
  serverType: "PLEX",
  serverName: "Northfield Plex",
  monogram: "N",
  inviter: "Dana Whitfield",
  libraries: ["Movies", "TV Shows"],
  usesLeft: { left: 3, total: 5 },
  expiresOn: "October 31, 2026",
}

function renderPass(props: Partial<InvitePassProps> = {}) {
  return render(
    <main>
      <InvitePass {...VALID} {...props} />
    </main>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(startPlexSignIn).mockResolvedValue({ success: true, data: { authUrl: "https://app.plex.tv/auth#?code=X" } })
})

describe("InvitePass, valid", () => {
  it("has one h1 naming the server, and no axe violations", async () => {
    const { container } = renderPass()

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByTestId("valid-invite-heading")).toHaveTextContent("You're invited to Northfield Plex")
    expect(screen.getByRole("region", { name: "You're invited to Northfield Plex" })).toHaveAttribute("data-state", "valid")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("shows the inviter, the libraries as badges and the stub fields", () => {
    renderPass()

    expect(screen.getByTestId("invite-pass-inviter")).toHaveTextContent("Dana Whitfield invited you")
    const libraries = screen.getByRole("list", { name: "Libraries in this invite" })
    expect(within(libraries).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Movies", "TV Shows"])
    expect(screen.getByTestId("invite-pass-code")).toHaveTextContent("NORTH7Q2")
    expect(screen.getByTestId("invite-pass-code")).toHaveClass("font-mono")
    expect(screen.getByTestId("invite-pass-uses")).toHaveTextContent("3 of 5")
    expect(screen.getByTestId("invite-pass-expiry")).toHaveTextContent("October 31, 2026")
    expect(screen.getByText("For one Plex account")).toBeInTheDocument()
  })

  it("accepts with Plex through the sign-in island, with the invite code", async () => {
    const user = userEvent.setup()
    renderPass()

    const island = screen.getByTestId("plex-invite-sign-in")
    await user.click(within(island).getByRole("button", { name: "Accept with Plex" }))

    expect(startPlexSignIn).toHaveBeenCalledWith({ inviteCode: "NORTH7Q2" })
    expect(redirectTo).toHaveBeenCalledWith("https://app.plex.tv/auth#?code=X")
  })

  it("shows the Jellyfin account form under the Jellyfin server's name", () => {
    renderPass({ serverType: "JELLYFIN", serverName: "Northfield Jellyfin" })

    expect(screen.getByTestId("valid-invite-heading")).toHaveTextContent("You're invited to Northfield Jellyfin")
    expect(screen.getByTestId("jellyfin-invite-form")).toBeInTheDocument()
    expect(screen.queryByTestId("plex-invite-sign-in")).not.toBeInTheDocument()
    expect(screen.getByText("For one Jellyfin account")).toBeInTheDocument()
  })

  it("draws an inert accept in the admin preview", () => {
    renderPass({ preview: true })

    expect(screen.getByTestId("invite-pass-preview-accept")).toBeDisabled()
    expect(screen.queryByTestId("plex-invite-sign-in")).not.toBeInTheDocument()
  })
})

describe("InvitePass, voided", () => {
  it.each([
    ["expired", "This invite has expired", /expired on October 31, 2026/],
    ["used-up", "This invite has no uses left", /Ask Dana Whitfield, who sent it, for a new link/],
    ["unknown", "We couldn't find that invite", /the invite was deleted/],
  ] as const)("%s has its own headline on the StatusScreen", async (state, title, description) => {
    const { container } = renderPass({ state, inviter: state === "unknown" ? null : "Dana Whitfield" })

    const heading = screen.getByTestId("invalid-invite-heading")
    expect(heading).toHaveTextContent(title)
    expect(heading).toHaveAttribute("data-state", state)
    expect(screen.getByTestId("status-screen")).toHaveTextContent(description)
    expect(screen.getByTestId("invite-pass")).toHaveAttribute("data-state", state)
    expect(screen.getByTestId("invite-pass-code")).toHaveClass("line-through")
    expect(screen.queryByTestId("valid-invite-heading")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Accept/ })).not.toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it("names the inviter to ask", () => {
    renderPass({ state: "used-up" })
    expect(screen.getByTestId("status-screen")).toHaveTextContent("Ask Dana Whitfield, who sent it, for a new link.")
  })

  it("offers Ask on Discord only when the owner set an invite code, and never Go to home", () => {
    const { unmount } = renderPass({ state: "expired" })
    expect(screen.queryByTestId("invite-ask-discord")).not.toBeInTheDocument()
    expect(screen.queryByText("Go to home")).not.toBeInTheDocument()
    expect(screen.getByTestId("invite-member-sign-in")).toHaveTextContent("Already a member? Sign in")
    unmount()

    renderPass({ state: "expired", discordInviteCode: "northfield" })
    expect(screen.getByTestId("invite-ask-discord")).toHaveAttribute("href", "https://discord.gg/northfield")
  })
})
