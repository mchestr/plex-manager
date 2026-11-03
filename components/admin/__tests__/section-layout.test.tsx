/**
 * `sectionLayout(id)`, the layout every admin section with tabs exports: the
 * tabs of the nav item `id` that the signed-in user may open, named by the
 * item's label, above the page. The strip shows only on a page that is one of
 * the tabs; with no session, for a role that may open none of the tabs, or
 * below a tab there is none, and the page renders either way. Which tabs an
 * item has is `nav.test.ts`'s to pin; this pins the wiring.
 */

import { render, screen, within } from "@testing-library/react"

import { resetUrl } from "@/__tests__/helpers/url-router"
import { sectionLayout } from "@/components/admin/section-layout"
import { ADMIN_NAV, type AdminNavItem } from "@/lib/admin/nav"
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

const sections = ADMIN_NAV.filter((item) => item.children)
const byId = (id: string) => ADMIN_NAV.find((item) => item.id === id) as AdminNavItem

async function renderLayout(itemId: string, pathname: string) {
  resetUrl(pathname)
  const Layout = sectionLayout(itemId)
  render(await Layout({ children: <p data-testid="page">The page</p> }))
}

beforeEach(() => {
  jest.mocked(getSession).mockResolvedValue(admin as never)
})

describe("sectionLayout", () => {
  it.each(sections.flatMap((item) => (item.children ?? []).map((child) => [item.id, child.id, child.href] as const)))(
    "%s: draws its tabs above the page, with %s selected on %s",
    async (itemId, tabId, pathname) => {
      const item = byId(itemId)
      await renderLayout(itemId, pathname)

      const strip = screen.getByRole("tablist", { name: item.label })
      expect(strip).toHaveAttribute("data-testid", `admin-section-tabs-${itemId}`)
      expect(within(strip).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(item.children?.map((child) => child.label))
      for (const child of item.children ?? []) {
        const tab = screen.getByTestId(`admin-section-tab-${child.id}`)
        expect(tab).toHaveAttribute("href", child.href)
        expect(tab).toHaveAttribute("aria-selected", String(child.id === tabId))
      }
      expect(strip.compareDocumentPosition(screen.getByTestId("page")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  )

  it("draws only the tabs a role may open: Users and Affiliates for Support, never Invites", async () => {
    jest.mocked(getSession).mockResolvedValue(support as never)

    await renderLayout("members", "/admin/users")

    const strip = screen.getByRole("tablist", { name: "Members" })
    expect(within(strip).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Users", "Affiliates"])
    expect(screen.getByTestId("admin-section-tab-users")).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByTestId("admin-section-tab-invites")).not.toBeInTheDocument()
  })

  it.each(sections.filter((item) => !item.children?.some((child) => child.permission)).map((item) => item.id))(
    "%s: draws no strip for a role that may open none of its tabs, and still renders the page",
    async (itemId) => {
      jest.mocked(getSession).mockResolvedValue(support as never)

      await renderLayout(itemId, byId(itemId).href)

      expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
      expect(screen.getByTestId("page")).toBeInTheDocument()
    }
  )

  it("draws no strip without a session, and still renders the page", async () => {
    jest.mocked(getSession).mockResolvedValue(null)

    await renderLayout("rewind", "/admin/rewind")

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
    expect(screen.getByTestId("page")).toBeInTheDocument()
  })

  it.each([
    ["members", "/admin/users/u1"],
    ["members", "/admin/invites/i1"],
    ["rewind", "/admin/rewind/abc/history"],
    ["ai", "/admin/ai/conversation/c1"],
  ])("%s: draws no strip on %s, a page below a tab, and still renders the page", async (itemId, pathname) => {
    await renderLayout(itemId, pathname)

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
    expect(screen.getByTestId("page")).toBeInTheDocument()
  })

  it("refuses an id that is not a nav item, so a typo fails when the layout is imported", () => {
    expect(() => sectionLayout("not-a-nav-item")).toThrow('"not-a-nav-item"')
  })
})
