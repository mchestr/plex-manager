/** The audit log while it loads: a status region with the filters' and the table's shapes. */

import { render, screen } from "@testing-library/react"

import Loading from "@/app/admin/audit/loading"

it("announces the loading audit log and draws the table's shape", () => {
  render(<Loading />)

  expect(screen.getByRole("status")).toHaveAttribute("data-testid", "admin-audit-loading")
  expect(screen.getByText("Loading")).toBeInTheDocument()
  expect(screen.getByTestId("admin-audit-loading").querySelector('[data-slot="table-skeleton"]')).toBeInTheDocument()
})
