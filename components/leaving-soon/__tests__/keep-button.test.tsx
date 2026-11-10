/**
 * The member Keep control (UX 9.2.1, 9.3, 7.9, 7.12, 8.6, 8.9, 10.3): the
 * result at once, the Undo toast with `toast-action`'s action, the revert
 * and the words of each failure, the limit with its reason line, End keep
 * with its dialog, the focus after each step, the test id bases of the
 * page card, the For you card and the Home row, and the shared meter.
 */

import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { renderToString } from "react-dom/server"

import { keepCleanupTitle, removeMyCleanupKeep } from "@/actions/cleanup-keeps"
import { KeepButton, KeepsProvider, useKeeps } from "@/components/leaving-soon/keep-button"

jest.mock("@/actions/cleanup-keeps", () => ({ keepCleanupTitle: jest.fn(), removeMyCleanupKeep: jest.fn() }))
const mockToast = jest.fn()
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: mockToast, showSuccess: mockShowSuccess, showError: mockShowError }) }))

const KEY = "movie:tmdb:1001"
const CARD = "leaving-soon-card-movie-tmdb-1001"
const HOME = "home-leaving-soon-item-movie-tmdb-1001"
const UNTIL = "2027-02-06T12:00:00.000Z"
const METER = { enabled: true, limit: 20, used: 2, days: 90 }
const DELETING = "This title, or part of it, is being deleted now. Try again in a few minutes."

function Meter() {
  const keeps = useKeeps()
  return <p data-testid="meter">{keeps ? `${keeps.used} of ${keeps.limit}` : "none"}</p>
}

function renderButton(props: Partial<ComponentProps<typeof KeepButton>> = {}, meter: Partial<typeof METER> = {}, graceDays?: number) {
  return render(
    <KeepsProvider keeps={{ ...METER, ...meter }} graceDays={graceDays}>
      <Meter />
      <KeepButton itemKey={KEY} title="The Invented Movie" testIdBase={CARD} {...props} />
    </KeepsProvider>
  )
}

/** A server answer that the test resolves when it wants. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

const undoAction = () => (mockToast.mock.calls.at(-1)?.[0] as { action: { label: string; onClick: () => void } }).action

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(keepCleanupTitle).mockResolvedValue({ success: true, data: { keepId: "keep-1", until: UNTIL } })
  jest.mocked(removeMyCleanupKeep).mockResolvedValue({ success: true, data: { restored: true } })
})

describe("KeepButton", () => {
  it("names the title on Keep, shows Kept by you and the end date at once, and moves focus to End keep", async () => {
    const user = userEvent.setup()
    const answer = deferred<Awaited<ReturnType<typeof keepCleanupTitle>>>()
    jest.mocked(keepCleanupTitle).mockReturnValue(answer.promise)
    renderButton()
    const keep = screen.getByTestId(`${CARD}-keep`)
    expect(keep).toHaveAccessibleName("Keep The Invented Movie")
    await user.click(keep)
    expect(screen.getByText("Kept by you")).toBeInTheDocument()
    expect(screen.getByText(/^Until /)).toBeInTheDocument()
    expect(screen.getByTestId(`${CARD}-end-keep`)).toHaveFocus()
    expect(screen.getByTestId(`${CARD}-end-keep`)).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByTestId("meter")).toHaveTextContent("3 of 20")
    expect(keepCleanupTitle).toHaveBeenCalledWith({ itemKey: KEY })
    await act(async () => answer.resolve({ success: true, data: { keepId: "keep-1", until: UNTIL } }))
    expect(screen.getByText("Until Feb 6, 2027")).toBeInTheDocument()
    expect(screen.getByTestId(`${CARD}-end-keep`)).not.toHaveAttribute("aria-disabled")
    expect(mockToast).toHaveBeenCalledWith({ title: "Kept The Invented Movie until Feb 6, 2027.", tone: "success", action: { label: "Undo", onClick: expect.any(Function) } })
  })

  it("gives the Home row the result state and the limit line under its own base", async () => {
    const user = userEvent.setup()
    renderButton({ testIdBase: HOME, size: "sm" })
    await user.click(screen.getByTestId(`${HOME}-keep`))
    expect(await screen.findByTestId(`${HOME}-end-keep`)).toHaveTextContent("End keep...")
    expect(screen.getByText("Kept by you")).toBeInTheDocument()
  })

  it("goes back and shows the deleting words when the title is being deleted", async () => {
    const user = userEvent.setup()
    jest.mocked(keepCleanupTitle).mockResolvedValue({ success: false, code: "CLEANUP_DELETING", error: DELETING })
    renderButton()
    await user.click(screen.getByTestId(`${CARD}-keep`))
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith(DELETING))
    expect(screen.getByTestId(`${CARD}-keep`)).toHaveFocus()
    expect(screen.queryByText("Kept by you")).not.toBeInTheDocument()
    expect(screen.getByTestId("meter")).toHaveTextContent("2 of 20")
    expect(mockToast).not.toHaveBeenCalled()
  })

  it.each([
    ["UPSTREAM_UNAVAILABLE", "Plex did not answer. Try again in a minute."],
    ["CLEANUP_NOT_LEAVING", "This title is no longer leaving soon."],
    ["CLEANUP_KEEP_LIMIT", "You keep 20 titles. End a Keep to keep this one."],
    ["RATE_LIMITED", "Too many tries."],
    ["INTERNAL", "That didn't work. Try again."],
  ])("shows the words of %s after a failed Keep", async (code, words) => {
    const user = userEvent.setup()
    jest.mocked(keepCleanupTitle).mockResolvedValue({ success: false, code, error: code === "RATE_LIMITED" ? words : "Some server words" } as never)
    renderButton()
    await user.click(screen.getByTestId(`${CARD}-keep`))
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith(words))
  })

  it("reads a thrown Keep as the fallback failure", async () => {
    const user = userEvent.setup()
    jest.mocked(keepCleanupTitle).mockRejectedValue(new Error("network"))
    renderButton()
    await user.click(screen.getByTestId(`${CARD}-keep`))
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("That didn't work. Try again."))
    expect(screen.getByTestId(`${CARD}-keep`)).toBeInTheDocument()
  })

  it("undoes the Keep from the toast and puts focus back on Keep", async () => {
    const user = userEvent.setup()
    renderButton()
    await user.click(screen.getByTestId(`${CARD}-keep`))
    await waitFor(() => expect(mockToast).toHaveBeenCalled())
    await act(async () => undoAction().onClick())
    expect(removeMyCleanupKeep).toHaveBeenCalledWith({ keepId: "keep-1", restore: true })
    expect(screen.getByTestId(`${CARD}-keep`)).toHaveFocus()
    expect(mockShowSuccess).toHaveBeenCalledWith("Keep undone")
    expect(screen.getByTestId("meter")).toHaveTextContent("2 of 20")
  })

  it("says Keep ended when the Undo acted as End keep", async () => {
    const user = userEvent.setup()
    jest.mocked(removeMyCleanupKeep).mockResolvedValue({ success: true, data: { restored: false } })
    renderButton()
    await user.click(screen.getByTestId(`${CARD}-keep`))
    await waitFor(() => expect(mockToast).toHaveBeenCalled())
    await act(async () => undoAction().onClick())
    expect(mockShowSuccess).toHaveBeenCalledWith("Keep ended")
  })

  it("does nothing on a late Undo after End keep", async () => {
    const user = userEvent.setup()
    renderButton()
    await user.click(screen.getByTestId(`${CARD}-keep`))
    await waitFor(() => expect(mockToast).toHaveBeenCalled())
    await user.click(screen.getByTestId(`${CARD}-end-keep`))
    await user.click(await screen.findByTestId("leaving-soon-end-keep-confirm"))
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Keep ended"))
    await act(async () => undoAction().onClick())
    expect(removeMyCleanupKeep).toHaveBeenCalledTimes(1)
    expect(removeMyCleanupKeep).toHaveBeenCalledWith({ keepId: "keep-1" })
    expect(screen.getByTestId(`${CARD}-keep`)).toBeInTheDocument()
    expect(screen.getByTestId("meter")).toHaveTextContent("2 of 20")
  })

  it("goes back to Kept by you when the Undo fails", async () => {
    const user = userEvent.setup()
    jest.mocked(removeMyCleanupKeep).mockResolvedValue({ success: false, code: "NOT_FOUND", error: "This Keep has already ended." })
    renderButton()
    await user.click(screen.getByTestId(`${CARD}-keep`))
    await waitFor(() => expect(mockToast).toHaveBeenCalled())
    await act(async () => undoAction().onClick())
    expect(screen.getByText("Kept by you")).toBeInTheDocument()
    expect(mockShowError).toHaveBeenCalledWith("That didn't work. Try again.")
    expect(screen.getByTestId("meter")).toHaveTextContent("3 of 20")
  })

  it("asks before End keep, names the grace period, ends the Keep at once and returns focus to Keep", async () => {
    const user = userEvent.setup()
    renderButton({ keep: { keepId: "keep-9", until: UNTIL } }, { used: 3 }, 30)
    expect(screen.getByText("Kept by you")).toBeInTheDocument()
    await user.click(screen.getByTestId(`${CARD}-end-keep`))
    const dialog = await screen.findByTestId("leaving-soon-end-keep-dialog")
    expect(dialog).toHaveTextContent("End your Keep on The Invented Movie?")
    expect(dialog).toHaveTextContent("It can come back to Leaving soon after the next nightly check, with a new leave date at least 30 days away.")
    await user.click(screen.getByTestId("leaving-soon-end-keep-confirm"))
    await waitFor(() => expect(screen.queryByTestId("leaving-soon-end-keep-dialog")).not.toBeInTheDocument())
    expect(removeMyCleanupKeep).toHaveBeenCalledWith({ keepId: "keep-9" })
    expect(screen.getByTestId(`${CARD}-keep`)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId(`${CARD}-keep`)).toHaveFocus())
    expect(mockShowSuccess).toHaveBeenCalledWith("Keep ended")
    expect(screen.getByTestId("meter")).toHaveTextContent("2 of 20")
  })

  it("puts the Keep back when End keep fails, and names a full grace period without one", async () => {
    const user = userEvent.setup()
    jest.mocked(removeMyCleanupKeep).mockResolvedValue({ success: false, code: "RATE_LIMITED", error: "Too many tries." })
    renderButton({ keep: { keepId: "keep-9", until: UNTIL }, endDialogTestId: "home-leaving-soon-end-keep" })
    await user.click(screen.getByTestId(`${CARD}-end-keep`))
    expect(await screen.findByTestId("home-leaving-soon-end-keep-dialog")).toHaveTextContent("with a full grace period.")
    await user.click(screen.getByTestId("home-leaving-soon-end-keep-confirm"))
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("Too many tries."))
    expect(screen.getByText("Kept by you")).toBeInTheDocument()
  })

  it("disables every Keep at the limit, keeps it focusable and names the reason", () => {
    renderButton({}, { used: 20 })
    const keep = screen.getByTestId(`${CARD}-keep`)
    expect(keep).toHaveAttribute("aria-disabled", "true")
    keep.focus()
    expect(keep).toHaveFocus()
    expect(screen.getByTestId(`${CARD}-limit`)).toHaveTextContent("You keep 20 titles. End a Keep to keep this one.")
    expect(keep).toHaveAccessibleDescription("You keep 20 titles. End a Keep to keep this one.")
  })

  it("shows the Home row limit line under its own base and Keeps nothing at the limit", async () => {
    const user = userEvent.setup()
    renderButton({ testIdBase: HOME }, { used: 20 })
    expect(screen.getByTestId(`${HOME}-limit`)).toBeInTheDocument()
    await user.click(screen.getByTestId(`${HOME}-keep`))
    expect(keepCleanupTitle).not.toHaveBeenCalled()
  })

  it("enables Keep again when an End keep frees a place", async () => {
    const user = userEvent.setup()
    render(
      <KeepsProvider keeps={{ ...METER, used: 20 }}>
        <KeepButton itemKey={KEY} title="The Invented Movie" testIdBase={CARD} />
        <KeepButton itemKey="movie:tmdb:2" title="A Kept Movie" testIdBase="leaving-soon-for-you-movie-tmdb-2" keep={{ keepId: "keep-2", until: UNTIL }} />
      </KeepsProvider>
    )
    expect(screen.getByTestId(`${CARD}-keep`)).toHaveAttribute("aria-disabled", "true")
    await user.click(screen.getByTestId("leaving-soon-for-you-movie-tmdb-2-end-keep"))
    await user.click(await screen.findByTestId("leaving-soon-end-keep-confirm"))
    await waitFor(() => expect(screen.getByTestId(`${CARD}-keep`)).not.toHaveAttribute("aria-disabled"))
    expect(screen.queryByTestId(`${CARD}-limit`)).not.toBeInTheDocument()
  })

  it("follows a newer server count of Keeps", () => {
    const { rerender } = render(
      <KeepsProvider keeps={METER}>
        <Meter />
      </KeepsProvider>
    )
    rerender(
      <KeepsProvider keeps={{ ...METER, used: 7 }}>
        <Meter />
      </KeepsProvider>
    )
    expect(screen.getByTestId("meter")).toHaveTextContent("7 of 20")
  })

  it("renders nothing without member Keeps, but still shows a Keep the member holds", () => {
    const { container } = renderButton({}, { enabled: false })
    expect(screen.queryByTestId(`${CARD}-keep`)).not.toBeInTheDocument()
    expect(container).toHaveTextContent("2 of 20")
    renderButton({ testIdBase: HOME, keep: { keepId: "keep-1", until: UNTIL } }, { enabled: false })
    expect(screen.getByTestId(`${HOME}-end-keep`)).toBeInTheDocument()
  })

  it("works with no provider and renders on the server", async () => {
    const user = userEvent.setup()
    render(<KeepButton itemKey={KEY} title="The Invented Movie" testIdBase={CARD} />)
    await user.click(screen.getByTestId(`${CARD}-keep`))
    expect(await screen.findByText("Kept by you")).toBeInTheDocument()
    expect(renderToString(<KeepButton itemKey={KEY} title="The Invented Movie" testIdBase={HOME} />)).toContain(`${HOME}-keep`)
  })
})
