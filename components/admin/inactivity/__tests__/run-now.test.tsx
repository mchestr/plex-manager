/**
 * Run now under the inactivity card: it runs at once while no one would be
 * removed, and otherwise asks to confirm the member count it then passes on,
 * so the run removes no one if more qualify. The last run reads as a line.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { runMemberActivityNow } from "@/actions/admin/inactivity"
import { RunNow } from "@/components/admin/inactivity/run-now"
import type { InactivityRunRow } from "@/lib/data/inactivity"

jest.mock("@/actions/admin/inactivity", () => ({ runMemberActivityNow: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const QUEUED = "Run queued. Reload the page in a minute to see the result."

const RUN: InactivityRunRow = {
  id: "run-1",
  startedAt: new Date("2026-10-31T02:17:00Z"),
  finishedAt: new Date("2026-10-31T02:18:00Z"),
  trigger: "scheduled",
  tautulliUsers: 12,
  matched: 10,
  qualified: 3,
  removed: 2,
  failed: 1,
  blocked: null,
  error: null,
  failedMembers: ["Ana Lopez"],
}

const run = () => screen.getByTestId("admin-inactivity-run-now")

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(runMemberActivityNow).mockResolvedValue({ success: true, data: { queued: true } })
})

describe("RunNow", () => {
  it("runs at once while automatic removal is off, whatever the preview lists", async () => {
    const user = userEvent.setup()
    render(<RunNow enabled={false} removals={3} lastRun={null} />)

    await user.click(run())

    expect(runMemberActivityNow).toHaveBeenCalledWith({})
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith(QUEUED))
    expect(screen.queryByTestId("admin-inactivity-run-dialog")).not.toBeInTheDocument()
  })

  it("runs at once when no one would be removed, and says when the run finished in the request", async () => {
    const user = userEvent.setup()
    jest.mocked(runMemberActivityNow).mockResolvedValue({ success: true, data: { queued: false } })
    render(<RunNow enabled removals={0} lastRun={null} />)

    await user.click(run())

    expect(runMemberActivityNow).toHaveBeenCalledWith({})
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Run finished"))
  })

  it("toasts a refusal", async () => {
    const user = userEvent.setup()
    jest
      .mocked(runMemberActivityNow)
      .mockResolvedValue({ success: false, code: "VALIDATION", error: "Set up Tautulli first. Last seen comes from Tautulli." })
    render(<RunNow enabled={false} removals={0} lastRun={null} />)

    await user.click(run())

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("Set up Tautulli first. Last seen comes from Tautulli."))
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })

  it("asks to confirm the member count first, then passes it on", async () => {
    const user = userEvent.setup()
    render(<RunNow enabled removals={2} lastRun={null} />)

    await user.click(run())
    const dialog = await screen.findByTestId("admin-inactivity-run-dialog")
    expect(within(dialog).getByRole("heading", { name: "Remove Plex access from 2 members now?" })).toBeInTheDocument()
    expect(dialog).toHaveTextContent("They lose access to the Plex server, as with Remove Plex access.")
    expect(dialog).toHaveTextContent("removes no one if more members are inactive then.")
    expect(runMemberActivityNow).not.toHaveBeenCalled()

    await user.click(screen.getByTestId("admin-inactivity-run-confirm"))

    expect(runMemberActivityNow).toHaveBeenCalledWith({ confirmedRemovals: 2 })
    await waitFor(() => expect(screen.queryByTestId("admin-inactivity-run-dialog")).not.toBeInTheDocument())
    expect(mockShowSuccess).toHaveBeenCalledWith(QUEUED)
  })

  it("names one member in the singular", async () => {
    const user = userEvent.setup()
    render(<RunNow enabled removals={1} lastRun={null} />)

    await user.click(run())

    expect(await screen.findByRole("heading", { name: "Remove Plex access from 1 member now?" })).toBeInTheDocument()
  })

  it("shows a refusal inside the dialog and stays open", async () => {
    const user = userEvent.setup()
    jest.mocked(runMemberActivityNow).mockResolvedValue({ success: false, code: "CONFLICT", error: "A run is already in progress." })
    render(<RunNow enabled removals={2} lastRun={null} />)

    await user.click(run())
    await user.click(await screen.findByTestId("admin-inactivity-run-confirm"))

    expect(await screen.findByText("A run is already in progress.")).toBeInTheDocument()
    expect(screen.getByTestId("admin-inactivity-run-dialog")).toBeInTheDocument()
    expect(mockShowError).not.toHaveBeenCalled()
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })

  it("runs nothing when the confirm is cancelled", async () => {
    const user = userEvent.setup()
    render(<RunNow enabled removals={2} lastRun={null} />)

    await user.click(run())
    await user.click(await screen.findByRole("button", { name: "Cancel" }))

    await waitFor(() => expect(screen.queryByTestId("admin-inactivity-run-dialog")).not.toBeInTheDocument())
    expect(runMemberActivityNow).not.toHaveBeenCalled()
  })

  describe("the last run", () => {
    it("says there is none yet", () => {
      render(<RunNow enabled removals={0} lastRun={null} />)

      expect(screen.getByTestId("admin-inactivity-last-run")).toHaveTextContent(/^No run yet\.$/)
    })

    it("reads when and how it started, and what it came to", () => {
      const { rerender } = render(<RunNow enabled removals={0} lastRun={RUN} />)

      const line = screen.getByTestId("admin-inactivity-last-run")
      expect(line).toHaveTextContent(/^Scheduled run, .+\. Removed 2 of 3 members\.$/)
      expect(screen.getByTestId("admin-inactivity-last-run-timestamp")).toHaveAttribute("dateTime", "2026-10-31T02:17:00.000Z")

      rerender(<RunNow enabled removals={0} lastRun={{ ...RUN, trigger: "admin", blocked: "disabled" }} />)
      expect(line).toHaveTextContent(/^Run by an admin, .+\. Automatic removal is off\.$/)
    })
  })
})
