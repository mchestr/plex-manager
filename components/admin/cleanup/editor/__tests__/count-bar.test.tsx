import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { CountBar } from "@/components/admin/cleanup/editor/count-bar"
import { buildPreview } from "@/components/admin/cleanup/preview/__tests__/fixtures"

expect.extend(toHaveNoViolations)

const handlers = () => ({ onResults: jest.fn(), onSave: jest.fn() })

describe("CountBar", () => {
  it("shows the count, size and delta, Results and Save, below lg only, above the tab bar on a phone", async () => {
    const h = handlers()
    const { container } = render(<CountBar preview={buildPreview()} updating={false} quiet={false} delta={6} isNew={false} dirty {...h} />)
    const bar = screen.getByTestId("admin-cleanup-count-bar")
    expect(bar).toHaveAccessibleName("Rule count")
    expect(bar).toHaveTextContent("197 movies, 1.3 TB")
    expect(bar).toHaveTextContent("6 more than before your last change")
    expect(bar.className).toContain("lg:hidden")
    expect(bar.className).toContain("bottom-[calc(4rem+env(safe-area-inset-bottom))]")
    expect(bar.className).toContain("md:bottom-0")
    expect(bar.className).toContain("scroll-pb-")
    expect(bar.querySelectorAll('[aria-live="polite"]')).toHaveLength(1)
    expect(screen.getByTestId("admin-cleanup-count-bar-save")).toHaveTextContent("Save")
    expect(screen.getByTestId("admin-cleanup-count-bar-save").className).toContain("md:hidden")
    await userEvent.click(screen.getByTestId("admin-cleanup-count-bar-results"))
    expect(h.onResults).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByTestId("admin-cleanup-count-bar-save"))
    expect(h.onSave).toHaveBeenCalledTimes(1)
    expect(await axe(container)).toHaveNoViolations()
  })

  it("reads Create (dry run) on a new rule, and disables Save without a change", async () => {
    const h = handlers()
    const { rerender } = render(<CountBar preview={buildPreview({ matches: 1 })} updating={false} quiet={false} delta={null} isNew dirty {...h} />)
    expect(screen.getByTestId("admin-cleanup-count-bar-save")).toHaveTextContent("Create (dry run)")
    expect(screen.getByTestId("admin-cleanup-count-bar")).toHaveTextContent("1 movie, 1.3 TB")
    expect(screen.queryByText(/than before your last change/)).toBeNull()
    rerender(<CountBar preview={buildPreview()} updating={false} quiet={false} delta={-3} isNew={false} dirty={false} {...h} />)
    expect(screen.getByTestId("admin-cleanup-count-bar-save")).toBeDisabled()
    expect(screen.getByTestId("admin-cleanup-count-bar")).toHaveTextContent("3 fewer than before your last change")
    await userEvent.click(screen.getByTestId("admin-cleanup-count-bar-save"))
    expect(h.onSave).not.toHaveBeenCalled()
  })

  it("dims the count while updating and keeps the region's words, and shows Saving while it saves", () => {
    const h = handlers()
    const { rerender } = render(<CountBar preview={buildPreview()} updating={false} quiet={false} delta={null} isNew={false} dirty {...h} />)
    rerender(<CountBar preview={buildPreview({ matches: 150 })} updating quiet={false} delta={null} isNew={false} dirty saving {...h} />)
    expect(screen.getByText("150 movies, 1.3 TB").parentElement?.className).toContain("opacity-55")
    expect(document.querySelector('[data-slot="count-region"]')).toHaveTextContent("197 matches")
    expect(screen.getByTestId("admin-cleanup-count-bar-save")).toHaveAttribute("aria-busy", "true")
    expect(screen.getByTestId("admin-cleanup-count-bar-save")).toHaveTextContent("Saving")
  })
})
