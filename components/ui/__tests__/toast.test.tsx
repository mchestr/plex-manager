import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { ToastProvider, useToast } from "@/components/ui/toast"

expect.extend(toHaveNoViolations)

type Api = ReturnType<typeof useToast>

function renderToasts() {
  const api: { current?: Api } = {}
  function Probe() {
    api.current = useToast()
    return <button type="button">Elsewhere</button>
  }
  render(
    <ToastProvider>
      <Probe />
    </ToastProvider>
  )
  return (fn: (toast: Api) => void) => act(() => fn(api.current!))
}

describe("toast", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const setupUser = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

  it("renders its viewport as the Notifications region", async () => {
    const fire = renderToasts()
    await fire((t) => t.showInfo("Library scan started"))

    const region = screen.getByRole("region", { name: "Notifications" })
    expect(region.tagName).toBe("SECTION")
    expect(region).toHaveAttribute("data-testid", "toast-viewport")
    expect(region).toContainElement(screen.getByTestId("toast"))
    jest.useRealTimers()
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it("showSuccess is a status that is gone at 5s", async () => {
    const fire = renderToasts()
    await fire((t) => t.showSuccess("Settings saved"))

    const toast = screen.getByRole("status")
    expect(toast).toHaveTextContent("Settings saved")
    expect(toast).toHaveAttribute("data-testid", "toast")
    expect(toast).toHaveAttribute("data-tone", "success")

    await act(async () => jest.advanceTimersByTime(4900))
    expect(screen.getByText("Settings saved")).toBeInTheDocument()
    await act(async () => jest.advanceTimersByTime(100))
    // The exit transition finishes before the toast leaves the DOM.
    await act(async () => jest.advanceTimersByTime(500))
    expect(screen.queryByText("Settings saved")).not.toBeInTheDocument()
  })

  it("keeps a success toast while it is hovered", async () => {
    const user = setupUser()
    const fire = renderToasts()
    await fire((t) => t.showSuccess("Settings saved"))

    await user.hover(screen.getByTestId("toast"))
    await act(async () => jest.advanceTimersByTime(10_000))
    expect(screen.getByText("Settings saved")).toBeInTheDocument()
  })

  it("the legacy duration applies to success and info", async () => {
    const fire = renderToasts()
    await fire((t) => t.showInfo("Copied", 1000))
    await act(async () => jest.advanceTimersByTime(1000))
    await act(async () => jest.advanceTimersByTime(500))
    expect(screen.queryByText("Copied")).not.toBeInTheDocument()
  })

  it("showError is an alert that is still present at 60s, with a circle-x icon", async () => {
    const fire = renderToasts()
    await fire((t) => t.showError("Plex didn't answer.", 1000))

    // One alert: the toast itself, never hidden from assistive technology.
    expect(screen.getByRole("alert")).toBe(screen.getByTestId("toast"))
    expect(screen.getByRole("alert")).toHaveTextContent("Plex didn't answer.")
    await act(async () => jest.advanceTimersByTime(60_000))
    const toast = screen.getByTestId("toast")
    expect(toast).toHaveAttribute("data-tone", "error")
    expect(toast.querySelector("svg.lucide-circle-x")).toBeInTheDocument()
    jest.useRealTimers()
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it("a toast with an action persists, and the action runs and dismisses it", async () => {
    const user = setupUser()
    const retry = jest.fn()
    const fire = renderToasts()
    await fire((t) => t.toast({ title: "Export ready", description: "3 files", tone: "success", action: { label: "Open", onClick: retry } }))

    await act(async () => jest.advanceTimersByTime(60_000))
    expect(screen.getByText("Export ready")).toBeInTheDocument()
    expect(screen.getByText("3 files")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Open" }))
    expect(retry).toHaveBeenCalledTimes(1)
    await act(async () => jest.advanceTimersByTime(500))
    expect(screen.queryByText("Export ready")).not.toBeInTheDocument()
  })

  it("Dismiss notification closes a toast", async () => {
    const user = setupUser()
    const fire = renderToasts()
    await fire((t) => t.showError("Plex didn't answer."))

    await user.click(screen.getByRole("button", { name: "Dismiss notification" }))
    await act(async () => jest.advanceTimersByTime(500))
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument()
  })

  it("F6 moves focus into the viewport, and Escape dismisses the focused toast", async () => {
    const user = setupUser()
    const fire = renderToasts()
    await fire((t) => t.showError("Plex didn't answer."))
    screen.getByRole("button", { name: "Elsewhere" }).focus()

    await user.keyboard("{F6}")
    expect(screen.getByTestId("toast-viewport")).toHaveFocus()

    await user.tab()
    expect(screen.getByTestId("toast")).toHaveFocus()
    await user.keyboard("{Escape}")
    await act(async () => jest.advanceTimersByTime(500))
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument()
  })

  it("useToast needs the provider", () => {
    function Orphan() {
      useToast()
      return null
    }
    jest.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<Orphan />)).toThrow()
  })
})
