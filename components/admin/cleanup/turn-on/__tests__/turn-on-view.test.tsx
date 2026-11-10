/**
 * The turn-on view (UX 4.6, TS 12.6 `turn-on/` item 1, E28, E34): focus on
 * the title, the button note for each mode, the disabled button with its
 * described reason, typed approval, the press and its answers, the reset
 * and the changed alert when newer numbers arrive, the reset with no alert
 * for a new `mode` prop, and the `reviewedAt` of the newest render.
 */

import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { turnOnCleanupRule } from "@/actions/admin/cleanup-rules"
import { changeModeData, check, OK_CHECKS, turnOnData } from "@/components/admin/cleanup/turn-on/__tests__/fixtures"
import { REDIS_REASON } from "@/components/admin/cleanup/turn-on/turn-on-words"
import { TurnOnView } from "@/components/admin/cleanup/turn-on/turn-on-view"
import type { CleanupTurnOnData } from "@/lib/cleanup/types/screens"

const mockPush = jest.fn()
const mockRefresh = jest.fn()
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh, replace: jest.fn() }),
  usePathname: () => "/admin/cleanup/rules/rule-1/turn-on",
  useSearchParams: () => new URLSearchParams(),
}))
jest.mock("@/actions/admin/cleanup-rules", () => ({ turnOnCleanupRule: jest.fn() }))
const mockShowSuccess = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: jest.fn() }) }))
jest.mock("@/components/admin/cleanup/why/why-sheet", () => ({ WhySheet: () => null }))

const turnOn = jest.mocked(turnOnCleanupRule)
const button = () => screen.getByTestId("admin-cleanup-turn-on-confirm")
const automatic = () => screen.getByRole("radio", { name: "Automatic" })
const renderView = (data: CleanupTurnOnData, redis = true) => render(<TurnOnView data={data} redis={redis} />)

beforeEach(() => {
  turnOn.mockReset()
  mockPush.mockReset()
  mockRefresh.mockReset()
  mockShowSuccess.mockReset()
})

describe("the page", () => {
  it("has the title, the breadcrumbs and the description, and starts focus on the title", () => {
    renderView(turnOnData())

    const title = screen.getByRole("heading", { level: 1, name: "Turn on Movies nobody watches" })
    expect(title).toHaveFocus()
    expect(title).toHaveAttribute("tabindex", "-1")
    const crumbs = within(screen.getByRole("navigation", { name: "Breadcrumb" })).getAllByRole("listitem")
    expect(crumbs.map((li) => li.textContent)).toEqual(["Media cleanup", "Rules", "Movies nobody watches", "Turn on"])
    expect(screen.getByText(/Read what happens before members see anything\. Nothing changes until you press the button on this page\./)).toBeInTheDocument()
    for (const name of ["What happens today", "When they leave", "Who sees it", "The budget", "Dry runs so far", "The 10 largest", "Ready to turn on", "At the leave date"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument()
    }
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/admin/cleanup/rules/rule-1")
  })

  it("titles Change mode", () => {
    renderView(changeModeData())
    expect(screen.getByRole("heading", { level: 1, name: "Change the mode of Movies nobody watches" })).toBeInTheDocument()
    expect(button()).toHaveTextContent("Switch to Automatic")
  })
})

describe("the button", () => {
  it("names the result and describes the chosen mode in the note under it", async () => {
    renderView(changeModeData())

    expect(button()).toHaveAccessibleDescription(/^Type 61 to turn on Automatic\. At the leave date: Automatic\. Radarr deletes the movies/)
    await userEvent.click(screen.getByRole("radio", { name: "Review first Suggested" }))
    expect(screen.getByTestId("admin-cleanup-turn-on-confirm-note")).toHaveTextContent("At the leave date: Review first. Nothing is deleted until you approve.")
    expect(button()).toHaveAccessibleDescription("This rule is already in Review first. At the leave date: Review first. Nothing is deleted until you approve.")
  })

  it("stays focusable while disabled, and its description is the failed check text", () => {
    const data = turnOnData({ checks: [check("featureOn", "failed", "all"), ...OK_CHECKS.slice(1)] })
    renderView(data)

    expect(button()).toHaveAttribute("aria-disabled", "true")
    button().focus()
    expect(button()).toHaveFocus()
    expect(button()).toHaveAccessibleDescription(
      "Media cleanup is off. Turn it on in Settings first. At the leave date: Review first. Nothing is deleted until you approve."
    )
    expect(screen.getByTestId("admin-cleanup-turn-on-check-feature-on")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-turn-on-top-check-feature-on")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-turn-on-top-check-feature-on-fix")).toHaveAttribute("href", expect.stringContaining("returnTo="))
    const ids = [...document.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid"))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("is disabled with the Redis reason without the job queue", async () => {
    renderView(turnOnData(), false)

    expect(screen.getByTestId("admin-cleanup-turn-on-reason")).toHaveTextContent(REDIS_REASON)
    expect(button()).toHaveAccessibleDescription(`${REDIS_REASON} At the leave date: Review first. Nothing is deleted until you approve.`)
    await userEvent.click(button())
    expect(turnOn).not.toHaveBeenCalled()
  })

  it("has no default focus on any button", () => {
    renderView(turnOnData())
    expect(document.activeElement?.tagName).toBe("H1")
  })
})

describe("typed approval", () => {
  it("asks for the count only for Automatic above 50, and enables the press once it matches", async () => {
    turnOn.mockResolvedValue({ success: true, data: { joined: 0, revision: 4 } })
    renderView(changeModeData())

    const field = screen.getByRole("textbox", { name: "Type 61 to turn on Automatic" })
    expect(field).toHaveAttribute("inputmode", "numeric")
    expect(button()).toHaveAttribute("aria-disabled", "true")
    await userEvent.type(field, "60")
    expect(button()).toHaveAttribute("aria-disabled", "true")
    await userEvent.clear(field)
    await userEvent.type(field, "61")
    expect(button()).toHaveAttribute("aria-disabled", "false")

    await userEvent.click(button())

    expect(turnOn).toHaveBeenCalledWith({
      ruleId: "rule-1", mode: "automatic", expectedRevision: 3, count: 61, keysHash: "a".repeat(64), reviewedAt: "2026-11-08T12:00:00.000Z", typedCount: 61,
    })
    expect(mockShowSuccess).toHaveBeenCalledWith("Mode changed")
    expect(mockPush).toHaveBeenCalledWith("/admin/cleanup/rules/rule-1")

    await userEvent.click(screen.getByRole("radio", { name: "Review first Suggested" }))
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })
})

describe("the press", () => {
  it("turns a Dry run rule on, opens the rule page with the toast, and shows no alert for its own render", async () => {
    turnOn.mockResolvedValue({ success: true, data: { joined: 197, revision: 4 } })
    const { rerender } = renderView(turnOnData())

    await userEvent.click(button())

    expect(turnOn).toHaveBeenCalledWith(expect.not.objectContaining({ typedCount: expect.anything() }))
    expect(mockShowSuccess).toHaveBeenCalledWith("Rule turned on")
    expect(mockPush).toHaveBeenCalledWith("/admin/cleanup/rules/rule-1")
    rerender(<TurnOnView data={changeModeData({ revision: 4, count: 197 })} redis />)
    expect(screen.queryByTestId("admin-cleanup-turn-on-changed")).not.toBeInTheDocument()
  })

  it("shows the error of a refusal and lets the admin press again", async () => {
    turnOn.mockResolvedValue({ success: false, code: "CONFLICT", error: "A run is in progress. Try again in a few minutes." })
    renderView(turnOnData())

    await userEvent.click(button())

    expect(screen.getByTestId("admin-cleanup-turn-on-error")).toHaveTextContent("A run is in progress. Try again in a few minutes.")
    expect(button()).toHaveAttribute("aria-disabled", "false")
    turnOn.mockRejectedValue(new Error("network"))
    await userEvent.click(button())
    expect(screen.getByTestId("admin-cleanup-turn-on-error")).toHaveTextContent("That didn't work. Try again.")
  })

  it("on a stale review shows the changed alert, clears the typed count and reads the page again", async () => {
    turnOn.mockResolvedValue({ success: false, code: "CLEANUP_REVIEW_STALE", error: "The numbers changed. Check them again." })
    renderView(changeModeData())

    await userEvent.type(screen.getByRole("textbox"), "61")
    await userEvent.click(button())

    const alert = screen.getByTestId("admin-cleanup-turn-on-changed")
    expect(alert).toHaveAttribute("role", "alert")
    expect(alert).toHaveTextContent("The numbers changed. Check them again.This page is older than 15 minutes, or the matches changed. Nothing was added.")
    expect(screen.getByRole("textbox")).toHaveValue("")
    expect(mockRefresh).toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("after a stale caused by the clock alone, sends the reviewedAt of the newest render", async () => {
    turnOn.mockResolvedValueOnce({ success: false, code: "CLEANUP_REVIEW_STALE", error: "The numbers changed. Check them again." })
    const { rerender } = renderView(turnOnData({ reviewedAt: "2026-11-08T11:00:00.000Z" }))

    await userEvent.click(button())
    expect(turnOn).toHaveBeenLastCalledWith(expect.objectContaining({ reviewedAt: "2026-11-08T11:00:00.000Z" }))

    turnOn.mockResolvedValueOnce({ success: true, data: { joined: 197, revision: 4 } })
    rerender(<TurnOnView data={turnOnData({ reviewedAt: "2026-11-08T11:20:00.000Z" })} redis />)
    await userEvent.click(button())

    expect(turnOn).toHaveBeenLastCalledWith(expect.objectContaining({ reviewedAt: "2026-11-08T11:20:00.000Z", expectedRevision: 3, count: 197 }))
  })
})

describe("newer server data (E34)", () => {
  it.each([
    ["count", { count: 60, typedApprovalCount: 60 }],
    ["keysHash", { keysHash: "b".repeat(64) }],
    ["revision", { revision: 4 }],
  ])("a new %s resets the mode choice and the typed count, shows the changed alert, and keeps focus", async (_, change) => {
    const { rerender } = renderView(changeModeData())
    await userEvent.click(screen.getByRole("radio", { name: "Review first Suggested" }))
    await userEvent.click(automatic())
    await userEvent.type(screen.getByRole("textbox"), "6")
    await userEvent.click(screen.getByRole("radio", { name: "Review first Suggested" }))
    const focused = document.activeElement

    rerender(<TurnOnView data={changeModeData(change)} redis />)

    expect(automatic()).toBeChecked()
    expect(screen.getByRole("textbox")).toHaveValue("")
    expect(screen.getByTestId("admin-cleanup-turn-on-changed")).toHaveAttribute("role", "alert")
    expect(document.activeElement).toBe(focused)
  })

  it("a new mode prop with the same numbers resets the choice with no alert", async () => {
    const { rerender } = renderView(changeModeData({ mode: "reviewFirst" }))
    expect(screen.getByRole("radio", { name: "Review first Suggested" })).toBeChecked()
    await userEvent.click(automatic())

    rerender(<TurnOnView data={changeModeData({ mode: "reviewFirst" })} redis />)
    expect(automatic()).toBeChecked()

    rerender(<TurnOnView data={changeModeData({ mode: "automatic" })} redis />)
    expect(automatic()).toBeChecked()
    await userEvent.type(screen.getByRole("textbox"), "61")
    rerender(<TurnOnView data={changeModeData({ mode: "reviewFirst" })} redis />)

    expect(screen.getByRole("radio", { name: "Review first Suggested" })).toBeChecked()
    expect(screen.queryByTestId("admin-cleanup-turn-on-changed")).not.toBeInTheDocument()
  })

  it("a render with the same numbers changes nothing", async () => {
    const { rerender } = renderView(changeModeData())
    await userEvent.type(screen.getByRole("textbox"), "61")
    rerender(<TurnOnView data={changeModeData({ reviewedAt: "2026-11-08T12:05:00.000Z" })} redis />)
    expect(screen.getByRole("textbox")).toHaveValue("61")
    expect(screen.queryByTestId("admin-cleanup-turn-on-changed")).not.toBeInTheDocument()
  })

  it("is no longer busy after the route hides during a press", async () => {
    let resolve: (value: Awaited<ReturnType<typeof turnOnCleanupRule>>) => void = () => undefined
    turnOn.mockReturnValue(new Promise((r) => (resolve = r)))
    const { unmount } = renderView(turnOnData())
    await userEvent.click(button())
    expect(button()).toHaveAttribute("aria-busy", "true")
    unmount()
    await act(async () => resolve({ success: true, data: { joined: 1, revision: 4 } }))
    expect(mockPush).toHaveBeenCalled()
  })
})
