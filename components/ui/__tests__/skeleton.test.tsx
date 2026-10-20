import { render, screen } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"

import { PageHeaderSkeleton, Skeleton, StatGridSkeleton, TableSkeleton } from "@/components/ui/skeleton"

expect.extend(toHaveNoViolations)

const blocks = (container: HTMLElement) => container.querySelectorAll('[data-slot="skeleton"]')

describe("Skeleton", () => {
  it("is a muted block on the skeleton pulse, never animate-pulse", () => {
    render(<Skeleton data-testid="skeleton" className="h-4 w-20" />)
    const skeleton = screen.getByTestId("skeleton")
    expect(skeleton).toHaveClass("animate-skeleton", "bg-muted", "h-4", "w-20")
    expect(skeleton).not.toHaveClass("animate-pulse")
  })

  it("PageHeaderSkeleton draws a title and a description line", () => {
    const { container } = render(<PageHeaderSkeleton />)
    expect(blocks(container)).toHaveLength(2)
  })

  it("StatGridSkeleton draws count tiles", () => {
    const { container } = render(<StatGridSkeleton count={4} />)
    expect(container.querySelector('[data-slot="stat-grid-skeleton"]')?.children).toHaveLength(4)
  })

  it("TableSkeleton draws a header row and rows of columns", () => {
    const { container } = render(<TableSkeleton rows={3} columns={5} />)
    const table = container.querySelector('[data-slot="table-skeleton"]')
    expect(table?.children).toHaveLength(4)
    expect(blocks(container)).toHaveLength(4 * 5)
  })

  it("has no axe violations", async () => {
    const { container } = render(
      <div>
        <PageHeaderSkeleton />
        <StatGridSkeleton count={2} />
        <TableSkeleton rows={2} columns={3} />
      </div>
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
