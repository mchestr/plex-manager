import { render, screen } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"

import { StatGrid, StatTile } from "@/components/ui/stat-tile"

expect.extend(toHaveNoViolations)

jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})

function Example() {
  return (
    <StatGrid data-testid="grid">
      <StatTile label="Members" value={7} unit="of 7 shared" href="/admin/users" />
      <StatTile
        label="Plex access"
        value={5}
        meter={[
          { value: 5, tone: "success", label: "5 allowed" },
          { value: 2, tone: "warning", label: "2 not verified" },
        ]}
      />
      <StatTile label="Watch time" value={null} data-testid="watch-time" />
      <StatTile label="Plays" value={0} data-testid="plays" />
    </StatGrid>
  )
}

describe("StatTile and StatGrid", () => {
  it("lays tiles two across below lg and four at lg, never one per row", () => {
    render(<Example />)
    const grid = screen.getByTestId("grid")
    expect(grid).toHaveClass("grid-cols-2", "lg:grid-cols-4")
    expect(grid.className).not.toMatch(/(^|\s)grid-cols-1(\s|$)/)
  })

  it("renders a failed value as a dash labelled Not available, never 0", () => {
    render(<Example />)
    const tile = screen.getByTestId("watch-time")
    expect(tile).toHaveTextContent("—")
    expect(tile).not.toHaveTextContent("0")
    expect(screen.getByRole("img", { name: "Not available" })).toHaveTextContent("—")
    expect(screen.getByTestId("plays")).toHaveTextContent("0")
  })

  it("names the meter from its segments", () => {
    render(<Example />)
    expect(screen.getByRole("img", { name: "5 allowed, 2 not verified" })).toBeInTheDocument()
  })

  it("makes the whole tile a link with href", () => {
    render(<Example />)
    expect(screen.getByRole("link", { name: /Members/ })).toHaveAttribute("href", "/admin/users")
  })

  it("has no axe violations", async () => {
    const { container } = render(<Example />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
