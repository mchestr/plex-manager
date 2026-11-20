import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { ErrorSummary } from "@/components/admin/cleanup/editor/error-summary"
import type { EditorError } from "@/lib/cleanup/editor/errors"

expect.extend(toHaveNoViolations)

const ERRORS: EditorError[] = [
  { key: "c2", code: "too_small", label: "Last played", message: "Enter a whole number of days from 1 to 3650." },
  { key: "a1", code: "too_small", label: "Any of these", message: "Add a second condition, or remove the group." },
  { key: "then.graceDays", code: "too_small", label: "Then", message: "In Automatic, the grace period is at least 7 days." },
]

describe("ErrorSummary", () => {
  it("is a focusable alert: Fix N things before you save, with one link for each problem", async () => {
    const onSelect = jest.fn()
    const { container } = render(<ErrorSummary errors={ERRORS} onSelect={onSelect} />)
    const summary = screen.getByRole("alert")
    expect(summary).toHaveAttribute("data-testid", "admin-cleanup-error-summary")
    expect(summary).toHaveAttribute("tabindex", "-1")
    expect(summary).toHaveTextContent("Fix 3 things before you save")
    expect(screen.getByTestId("admin-cleanup-error-link-c2")).toHaveTextContent("Last played: enter a whole number of days from 1 to 3650.")
    expect(screen.getByTestId("admin-cleanup-error-link-a1")).toHaveTextContent("Any of these: add a second condition, or remove the group.")
    expect(screen.getByTestId("admin-cleanup-error-link-then-grace-days")).toHaveTextContent(
      "Then: in Automatic, the grace period is at least 7 days."
    )
    await userEvent.click(screen.getByTestId("admin-cleanup-error-link-a1"))
    expect(onSelect).toHaveBeenCalledWith("a1")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("reads one thing in the singular, and renders nothing without errors", () => {
    const { rerender, container } = render(<ErrorSummary errors={[ERRORS[0]]} onSelect={jest.fn()} />)
    expect(screen.getByRole("alert")).toHaveTextContent("Fix 1 thing before you save")
    rerender(<ErrorSummary errors={[]} onSelect={jest.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
