/** Media cleanup while it loads: a status region with the shapes of the tabs, the tiles and two rule cards. */

import { render, screen } from "@testing-library/react"

import Loading from "@/app/admin/(automations)/cleanup/loading"

it("announces the loading page and draws the tabs, the tiles and two rule cards", () => {
  render(<Loading />)

  const region = screen.getByRole("status")
  expect(region).toHaveAttribute("data-testid", "admin-cleanup-loading")
  expect(screen.getByText("Loading")).toBeInTheDocument()
  expect(region.querySelector('[data-slot="cleanup-tabs-skeleton"]')?.children).toHaveLength(5)
  expect(region.querySelector('[data-slot="stat-grid-skeleton"]')?.children).toHaveLength(4)
  expect(region.querySelectorAll('[data-slot="rule-card-skeleton"]')).toHaveLength(2)
})
