import { render, screen, within } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"

import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"

expect.extend(toHaveNoViolations)

jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})

function Example() {
  return (
    <PageHeader
      title="Morgan Lee"
      description="Member since March 2024."
      breadcrumbs={[{ label: "Users", href: "/admin/users" }, { label: "Morgan Lee" }]}
      meta={<span>Admin</span>}
      actions={
        <>
          <Button variant="outline">Export</Button>
          <Button>Invite member</Button>
        </>
      }
      data-testid="admin-users-header"
    />
  )
}

describe("PageHeader", () => {
  it("puts the breadcrumbs in a Breadcrumb landmark, the current page last", () => {
    render(<Example />)
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" })
    expect(within(nav).getByRole("link", { name: "Users" })).toHaveAttribute("href", "/admin/users")
    expect(within(nav).getByText("Morgan Lee")).toHaveAttribute("aria-current", "page")
  })

  it("renders one h1 with the title", () => {
    render(<Example />)
    const headings = screen.getAllByRole("heading", { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent("Morgan Lee")
  })

  it("keeps the action order: secondary first, primary last", () => {
    render(<Example />)
    const names = within(screen.getByTestId("admin-users-header"))
      .getAllByRole("button")
      .map((button) => button.textContent)
    expect(names).toEqual(["Export", "Invite member"])
  })

  it("forwards data-testid and leaves out the breadcrumb nav when there are none", () => {
    render(<PageHeader title="Users" data-testid="admin-users-header" />)
    expect(screen.getByTestId("admin-users-header")).toBeInTheDocument()
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument()
  })

  it("has no axe violations", async () => {
    const { container } = render(<Example />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
