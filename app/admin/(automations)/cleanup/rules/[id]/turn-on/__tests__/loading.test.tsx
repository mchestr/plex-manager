/** The turn-on page while it loads: a status region with the shapes of both columns. */

import { render, screen } from "@testing-library/react"

import Loading from "@/app/admin/(automations)/cleanup/rules/[id]/turn-on/loading"

it("announces the loading page and draws the cards of both columns", () => {
  render(<Loading />)

  expect(screen.getByRole("status")).toHaveAttribute("data-testid", "admin-cleanup-turn-on-loading")
  expect(screen.getByText("Loading")).toBeInTheDocument()
  expect(screen.getByTestId("admin-cleanup-turn-on-loading").querySelectorAll(".rounded-lg.border")).toHaveLength(5)
})
