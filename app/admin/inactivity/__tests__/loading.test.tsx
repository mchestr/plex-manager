/** The inactive members page while it loads: a status region with the card's and the two tables' shapes. */

import { render, screen } from "@testing-library/react"

import Loading from "@/app/admin/inactivity/loading"

it("announces the loading page and draws the card and both tables", () => {
  render(<Loading />)

  expect(screen.getByRole("status")).toHaveAttribute("data-testid", "admin-inactivity-loading")
  expect(screen.getByText("Loading")).toBeInTheDocument()
  expect(screen.getByTestId("admin-inactivity-loading").querySelectorAll('[data-slot="table-skeleton"]')).toHaveLength(2)
})
