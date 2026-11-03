/**
 * The layouts of the admin sections with tabs are `sectionLayout(<nav item>)`
 * (`components/admin/section-layout.tsx` has the behaviour tests): each route
 * group's layout draws the strip of its own nav item, and every nav item with
 * tabs has a layout, since an item without one would show no tabs at all.
 */

import { render, screen } from "@testing-library/react"

import { resetUrl } from "@/__tests__/helpers/url-router"
import AiLayout from "@/app/admin/(ai)/layout"
import AutomationsLayout from "@/app/admin/(automations)/layout"
import MembersLayout from "@/app/admin/(members)/layout"
import RewindLayout from "@/app/admin/(rewind)/layout"
import DiscordLayout from "@/app/admin/discord/layout"
import { ADMIN_NAV, type AdminNavItem } from "@/lib/admin/nav"
import { getSession } from "@/lib/data/session"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("@/lib/data/session", () => ({ getSession: jest.fn() }))
// The real Link prefetches on an IntersectionObserver timer, outside act().
jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})

const LAYOUTS = { ai: AiLayout, automations: AutomationsLayout, discord: DiscordLayout, members: MembersLayout, rewind: RewindLayout }

beforeEach(() => {
  jest.mocked(getSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true, role: null }, expires: "" } as never)
})

it("has a layout for every nav item with tabs", () => {
  expect(Object.keys(LAYOUTS).sort()).toEqual(ADMIN_NAV.filter((item) => item.children).map((item) => item.id).sort())
})

it.each(Object.entries(LAYOUTS))("the %s layout draws its own item's strip above the page", async (id, Layout) => {
  const item = ADMIN_NAV.find((candidate) => candidate.id === id) as AdminNavItem
  resetUrl(item.href)

  render(await Layout({ children: <p data-testid="page">The page</p> }))

  expect(screen.getByRole("tablist", { name: item.label })).toHaveAttribute("data-testid", `admin-section-tabs-${id}`)
  expect(screen.getByTestId("page")).toBeInTheDocument()
})
