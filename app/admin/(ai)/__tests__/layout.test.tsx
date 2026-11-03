/**
 * The AI section layout: the Activity, Cost and Settings tabs above every AI
 * page, drawn from the signed-in user's permissions, with the page under them.
 */

import { render, screen, within } from "@testing-library/react"
import { usePathname } from "next/navigation"

import AiSectionLayout from "@/app/admin/(ai)/layout"
import { getSession } from "@/lib/data/session"

jest.mock("next/navigation", () => ({ usePathname: jest.fn() }))
// The real Link prefetches on an IntersectionObserver timer, outside act().
jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})
jest.mock("@/lib/data/session", () => ({ getSession: jest.fn() }))

async function renderLayout(pathname: string) {
  jest.mocked(usePathname).mockReturnValue(pathname)
  render(await AiSectionLayout({ children: <p data-testid="page">Page</p> }))
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" } as never)
})

describe("AI section layout", () => {
  it("draws Activity, Cost and Settings above the page, with the open page's tab selected", async () => {
    await renderLayout("/admin/cost-analysis")

    const tabs = screen.getByRole("tablist", { name: "AI" })
    expect(tabs).toHaveAttribute("data-testid", "admin-section-tabs-ai")
    expect(within(tabs).getAllByRole("tab").map((tab) => [tab.textContent, tab.getAttribute("href"), tab.getAttribute("aria-selected")])).toEqual([
      ["Activity", "/admin/ai", "false"],
      ["Cost", "/admin/cost-analysis", "true"],
      ["Settings", "/admin/ai/settings", "false"],
    ])
    expect(screen.getByTestId("admin-section-tab-ai-cost")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("page")).toBeInTheDocument()
  })

  it("draws no tabs for a user the AI pages are closed to, and still the page", async () => {
    jest.mocked(getSession).mockResolvedValue({ user: { id: "support-1", isAdmin: false, role: "support" }, expires: "" } as never)
    await renderLayout("/admin/ai")

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
    expect(screen.getByTestId("page")).toBeInTheDocument()
  })

  it("draws no tabs without a session, and still the page", async () => {
    jest.mocked(getSession).mockResolvedValue(null)
    await renderLayout("/admin/ai")

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
    expect(screen.getByTestId("page")).toBeInTheDocument()
  })
})
