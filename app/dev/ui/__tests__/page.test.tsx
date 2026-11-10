import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import DevUiPage, { metadata } from "@/app/dev/ui/page"
import { ToastProvider } from "@/components/ui/toast"

expect.extend(toHaveNoViolations)

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)

// The RewindCard specimens never poll; this keeps the status action's imports out
jest.mock("@/hooks/use-rewind-status", () => ({ useRewindStatus: jest.fn() }))

jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})

describe("/dev/ui", () => {
  afterEach(() => {
    delete process.env.ENABLE_DEV_UI
  })

  it("is not found unless ENABLE_DEV_UI is 1", () => {
    expect(() => DevUiPage()).toThrow("NEXT_NOT_FOUND")

    process.env.ENABLE_DEV_UI = "true"
    expect(() => DevUiPage()).toThrow("NEXT_NOT_FOUND")
  })

  it("is never indexed", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it("shows every primitive under its test id, with no axe violations", async () => {
    process.env.ENABLE_DEV_UI = "1"
    const { container } = render(<ToastProvider>{DevUiPage()}</ToastProvider>)

    for (const primitive of [
      "button",
      "card",
      "badge",
      "status-badge",
      "alert",
      "spinner",
      "skeleton",
      "icon",
      "input",
      "field",
      "checkbox",
      "switch",
      "select",
      "dialog",
      "alert-dialog",
      "confirm-dialog",
      "dropdown-menu",
      "command",
      "popover",
      "tooltip",
      "toast",
      "sheet",
      "toggle",
      "slider",
      "segmented-control",
      "live-status",
      "ink",
      "ink-paper",
      "ink-marigold",
      "ink-ultramarine",
      "status-vocabulary",
      "icon-map",
      "poster-palette",
      "page-header",
      "stat-tile",
      "stat-grid",
      "data-table",
      "users-table",
      "plays-table",
      "filter-bar",
      "date-range-filter",
      "empty-state",
      "chart-card",
      "rewind-card",
      "status-screen",
      "token",
      "condition-editor",
      "choice-chips",
      "number-field",
      "combobox",
      "fieldset",
      "value-histogram",
      "collapsible",
      "table-selection",
    ]) {
      expect(screen.getByTestId(`dev-ui-${primitive}`)).toBeInTheDocument()
    }
    expect(await axe(container)).toHaveNoViolations()
  }, 60_000) // axe over the whole sheet takes several seconds

  it("draws the media cleanup primitives, and opens the condition editor from a token", async () => {
    process.env.ENABLE_DEV_UI = "1"
    const user = userEvent.setup()
    render(<ToastProvider>{DevUiPage()}</ToastProvider>)

    expect(screen.getByTestId("dev-ui-token-changed")).toHaveAccessibleName("180 days, value, changed. Change.")
    expect(screen.getByTestId("dev-ui-token-static").tagName).toBe("SPAN")
    expect(screen.getByTestId("dev-ui-checkbox-indeterminate")).toHaveAttribute("aria-checked", "mixed")
    expect(screen.getByTestId("dev-ui-table-selection-bulk-count")).toHaveTextContent("1 selected")
    expect(screen.getByTestId("dev-ui-condition-editor-value")).toHaveTextContent("365 days")

    await user.click(screen.getByTestId("dev-ui-condition-editor-value"))
    const editor = await screen.findByTestId("admin-cleanup-condition-editor")
    expect(editor).toHaveAccessibleName("Condition 2 of 3 Last played")
    // jsdom matches no media query, so the editor opens in the phone Sheet.
    expect(editor).toHaveAttribute("data-shell", "sheet")
    expect(within(editor).getByTestId("admin-cleanup-condition-editor-count")).toHaveTextContent("With this value: 197 matches")
    await user.click(within(editor).getByTestId("admin-cleanup-condition-editor-preset-2-years"))
    await user.click(within(editor).getByTestId("admin-cleanup-condition-editor-done"))
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-condition-editor")).toBeNull())
    expect(screen.getByTestId("dev-ui-condition-editor-value")).toHaveTextContent("2 years")

    await user.click(screen.getByTestId("dev-ui-condition-editor-field"))
    await screen.findByTestId("admin-cleanup-condition-editor")
    await user.click(screen.getByTestId("admin-cleanup-condition-editor-close"))
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-condition-editor")).toBeNull())
  })

  it("draws the composites from 7 members and 120 plays", () => {
    process.env.ENABLE_DEV_UI = "1"
    render(<ToastProvider>{DevUiPage()}</ToastProvider>)

    expect(screen.getByTestId("dev-ui-users-table-pagination-info")).toHaveTextContent("Showing all 7 members")
    expect(screen.getByTestId("dev-ui-plays-table-pagination-info")).toHaveTextContent("Showing 1 to 25 of 120 plays")
    expect(screen.getByTestId("dev-ui-plays-filters-count")).toHaveTextContent("120 plays")
  })
})
