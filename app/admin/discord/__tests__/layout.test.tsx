/**
 * The Discord section's layout: the Activity and Settings tabs above whichever
 * page is open, for an admin. Without a session, or for a role that may open
 * neither tab, there is no strip, and the page renders either way.
 */

import { render, screen } from "@testing-library/react"

import { resetUrl } from "@/__tests__/helpers/url-router"
import DiscordSectionLayout from "@/app/admin/discord/layout"
import { getSession } from "@/lib/data/session"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("@/lib/data/session", () => ({ getSession: jest.fn() }))
// The real Link prefetches on an IntersectionObserver timer, outside act().
jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})

const admin = { user: { id: "admin-1", isAdmin: true, role: null }, expires: "" }
const support = { user: { id: "support-1", isAdmin: false, role: "support" }, expires: "" }

async function renderLayout(pathname: string) {
  resetUrl(pathname)
  render(await DiscordSectionLayout({ children: <p data-testid="page">The page</p> }))
}

beforeEach(() => {
  jest.mocked(getSession).mockResolvedValue(admin as never)
})

describe("Discord section layout", () => {
  it.each([
    ["/admin/discord", "discord-activity"],
    ["/admin/discord/settings", "discord-settings"],
  ])("draws the Activity and Settings tabs above the page, with the tab of %s selected", async (pathname, selected) => {
    await renderLayout(pathname)

    const strip = screen.getByRole("tablist", { name: "Discord" })
    expect(strip).toHaveAttribute("data-testid", "admin-section-tabs-discord")
    expect(screen.getByTestId("admin-section-tab-discord-activity")).toHaveTextContent("Activity")
    expect(screen.getByTestId("admin-section-tab-discord-activity")).toHaveAttribute("href", "/admin/discord")
    expect(screen.getByTestId("admin-section-tab-discord-settings")).toHaveTextContent("Settings")
    expect(screen.getByTestId("admin-section-tab-discord-settings")).toHaveAttribute("href", "/admin/discord/settings")
    for (const id of ["discord-activity", "discord-settings"]) {
      expect(screen.getByTestId(`admin-section-tab-${id}`)).toHaveAttribute("aria-selected", String(id === selected))
    }
    expect(strip.compareDocumentPosition(screen.getByTestId("page")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("draws no strip below a tab, and still renders the page", async () => {
    await renderLayout("/admin/discord/elsewhere")

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
    expect(screen.getByTestId("page")).toBeInTheDocument()
  })

  it("draws no strip without a session, and still renders the page", async () => {
    jest.mocked(getSession).mockResolvedValue(null)
    await renderLayout("/admin/discord")

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
    expect(screen.getByTestId("page")).toBeInTheDocument()
  })

  it("draws no strip for a role that may open neither tab: Discord is for admins", async () => {
    jest.mocked(getSession).mockResolvedValue(support as never)
    await renderLayout("/admin/discord")

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
    expect(screen.getByTestId("page")).toBeInTheDocument()
  })
})
