/**
 * Run now under the inactivity card: it runs at once while no one would be
 * removed, and otherwise asks to confirm the members the preview lists, whose
 * ids it then passes on, so the run removes no one outside that list. One
 * button stays in place whatever the list becomes when the page revalidates,
 * so focus stays on it, and an open confirm closes as the router hides the
 * page. The last run reads as a line.
 */

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Activity } from "react"

import { runMemberActivityNow } from "@/actions/admin/inactivity"
import { RunNow } from "@/components/admin/inactivity/run-now"
import type { InactivityRunRow } from "@/lib/data/inactivity"

jest.mock("@/actions/admin/inactivity", () => ({ runMemberActivityNow: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

type RunResult = Awaited<ReturnType<typeof runMemberActivityNow>>

const QUEUED = "Run queued. Reload the page in a minute to see the result."
const BUSY = "A run is already in progress. Try again in a few minutes."
const QUEUE_DOWN = "The job queue is unavailable. Try again in a minute."
const IDS = ["u-ana", "u-ben"]

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
const dialog = () => screen.queryByTestId("admin-inactivity-run-dialog")

/** Holds the action open until the test settles it, as a slow run does. */
function holdRun(): (result: RunResult) => Promise<void> {
  let settle: (result: RunResult) => void = () => {}
  jest.mocked(runMemberActivityNow).mockImplementation(() => new Promise((resolve) => (settle = resolve)))
  return (result) => act(async () => settle(result))
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(runMemberActivityNow).mockResolvedValue({ success: true, data: { queued: true } })
})

describe("RunNow", () => {
  describe("at once", () => {
    it("runs while automatic removal is off, whatever the preview lists", async () => {
      const user = userEvent.setup()
      render(<RunNow enabled={false} removalIds={IDS} lastRun={null} />)

      await user.click(run())

      expect(runMemberActivityNow).toHaveBeenCalledWith({})
      await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith(QUEUED))
      expect(dialog()).not.toBeInTheDocument()
    })

    it("runs when no one would be removed, and says when the run finished in the request", async () => {
      const user = userEvent.setup()
      jest.mocked(runMemberActivityNow).mockResolvedValue({ success: true, data: { queued: false } })
      render(<RunNow enabled removalIds={[]} lastRun={null} />)

      await user.click(run())

      expect(runMemberActivityNow).toHaveBeenCalledWith({})
      await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Run finished"))
    })

    it.each([
      ["no Tautulli", "VALIDATION", "Set up Tautulli first. Last seen comes from Tautulli."],
      ["another run", "CONFLICT", BUSY],
      ["the queue down", "UPSTREAM_UNAVAILABLE", QUEUE_DOWN],
    ] as const)("toasts the refusal for %s", async (_case, code, error) => {
      const user = userEvent.setup()
      jest.mocked(runMemberActivityNow).mockResolvedValue({ success: false, code, error })
      render(<RunNow enabled={false} removalIds={[]} lastRun={null} />)

      await user.click(run())

      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith(error))
      expect(mockShowSuccess).not.toHaveBeenCalled()
    })

    it("stays busy with focus while the run is on its way, and keeps the button when the page lists members after it", async () => {
      const user = userEvent.setup()
      const settle = holdRun()
      const { rerender } = render(<RunNow enabled removalIds={[]} lastRun={null} />)
      const button = run()

      await user.click(button)
      expect(button).toHaveAttribute("aria-busy", "true")
      expect(button).toHaveFocus()

      await settle({ success: true, data: { queued: false } })
      expect(button).not.toHaveAttribute("aria-busy")
      // The run found members to remove and stopped for a confirm: the revalidated page lists them
      rerender(<RunNow enabled removalIds={IDS} lastRun={{ ...RUN, trigger: "admin", blocked: "not_confirmed" }} />)

      expect(run()).toBe(button)
      expect(button).toHaveFocus()
      expect(dialog()).not.toBeInTheDocument()
    })
  })

  describe("after a confirm", () => {
    it("names the members first, then passes their ids on and puts focus back on Run now", async () => {
      const user = userEvent.setup()
      render(<RunNow enabled removalIds={IDS} lastRun={null} />)
      const button = run()

      await user.click(button)
      const open = await screen.findByTestId("admin-inactivity-run-dialog")
      expect(within(open).getByRole("heading", { name: "Remove Plex access from 2 members now?" })).toBeInTheDocument()
      expect(open).toHaveTextContent("They lose access to the Plex server, as with Remove Plex access.")
      expect(open).toHaveTextContent("If it would then remove a member who is not in the list on this page, it removes no one.")
      expect(runMemberActivityNow).not.toHaveBeenCalled()

      await user.click(screen.getByTestId("admin-inactivity-run-confirm"))

      expect(runMemberActivityNow).toHaveBeenCalledWith({ confirmedUserIds: IDS })
      await waitFor(() => expect(dialog()).not.toBeInTheDocument())
      expect(mockShowSuccess).toHaveBeenCalledWith(QUEUED)
      await waitFor(() => expect(button).toHaveFocus())
    })

    it("puts focus on Run now after the run even when the click did not focus it, as in Safari", async () => {
      const user = userEvent.setup()
      render(<RunNow enabled removalIds={IDS} lastRun={null} />)
      const button = run()

      fireEvent.click(button)
      expect(button).not.toHaveFocus()
      await user.click(await screen.findByTestId("admin-inactivity-run-confirm"))

      await waitFor(() => expect(dialog()).not.toBeInTheDocument())
      await waitFor(() => expect(button).toHaveFocus())
    })

    it("names one member in the singular", async () => {
      const user = userEvent.setup()
      render(<RunNow enabled removalIds={["u-ana"]} lastRun={null} />)

      await user.click(run())

      expect(await screen.findByRole("heading", { name: "Remove Plex access from 1 member now?" })).toBeInTheDocument()
    })

    it.each([
      ["another run", "CONFLICT", BUSY],
      ["the queue down", "UPSTREAM_UNAVAILABLE", QUEUE_DOWN],
    ] as const)("shows the refusal for %s inside the dialog and stays open", async (_case, code, error) => {
      const user = userEvent.setup()
      jest.mocked(runMemberActivityNow).mockResolvedValue({ success: false, code, error })
      render(<RunNow enabled removalIds={IDS} lastRun={null} />)

      await user.click(run())
      await user.click(await screen.findByTestId("admin-inactivity-run-confirm"))

      expect(await screen.findByText(error)).toBeInTheDocument()
      expect(dialog()).toBeInTheDocument()
      expect(mockShowError).not.toHaveBeenCalled()
      expect(mockShowSuccess).not.toHaveBeenCalled()
    })

    it("runs nothing when the confirm is cancelled, and puts focus back on Run now", async () => {
      const user = userEvent.setup()
      render(<RunNow enabled removalIds={IDS} lastRun={null} />)
      const button = run()

      await user.click(button)
      await user.click(await screen.findByRole("button", { name: "Cancel" }))

      await waitFor(() => expect(dialog()).not.toBeInTheDocument())
      expect(runMemberActivityNow).not.toHaveBeenCalled()
      await waitFor(() => expect(button).toHaveFocus())
    })

    it("closes as the router hides the page, so it is not open again on the way back", async () => {
      const user = userEvent.setup()
      const page = (mode: "visible" | "hidden") => (
        <Activity mode={mode}>
          <RunNow enabled removalIds={IDS} lastRun={null} />
        </Activity>
      )
      const { rerender } = render(page("visible"))
      await user.click(run())
      expect(await screen.findByTestId("admin-inactivity-run-dialog")).toBeInTheDocument()

      rerender(page("hidden"))
      rerender(page("visible"))

      await waitFor(() => expect(dialog()).not.toBeInTheDocument())
      expect(run()).toBeVisible()
      expect(runMemberActivityNow).not.toHaveBeenCalled()
    })

    it("keeps the button and puts focus on it when the page revalidates with no one left to remove", async () => {
      const user = userEvent.setup()
      const settle = holdRun()
      const { rerender } = render(<RunNow enabled removalIds={IDS} lastRun={null} />)
      const button = run()

      await user.click(button)
      await user.click(await screen.findByTestId("admin-inactivity-run-confirm"))
      // A run in the request removed both, and the revalidated page arrives before the action returns
      rerender(<RunNow enabled removalIds={[]} lastRun={{ ...RUN, qualified: 2, removed: 2, failed: 0 }} />)
      await settle({ success: true, data: { queued: false } })

      await waitFor(() => expect(dialog()).not.toBeInTheDocument())
      expect(run()).toBe(button)
      await waitFor(() => expect(button).toHaveFocus())
      expect(mockShowSuccess).toHaveBeenCalledWith("Run finished")
    })
  })

  describe("the last run", () => {
    it("says there is none yet", () => {
      render(<RunNow enabled removalIds={[]} lastRun={null} />)

      expect(screen.getByTestId("admin-inactivity-last-run")).toHaveTextContent(/^No run yet\.$/)
    })

    it("reads when and how it started, and what it came to", () => {
      const { rerender } = render(<RunNow enabled removalIds={[]} lastRun={RUN} />)

      const line = screen.getByTestId("admin-inactivity-last-run")
      expect(line).toHaveTextContent(/^Scheduled run, .+\. Removed 2 of 3 members\.$/)
      expect(screen.getByTestId("admin-inactivity-last-run-timestamp")).toHaveAttribute("dateTime", "2026-10-31T02:17:00.000Z")

      rerender(<RunNow enabled removalIds={[]} lastRun={{ ...RUN, trigger: "admin", blocked: "disabled" }} />)
      expect(line).toHaveTextContent(/^Run by an admin, .+\. Automatic removal is off\.$/)
    })
  })
})
