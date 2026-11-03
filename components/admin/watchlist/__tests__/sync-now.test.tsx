/**
 * Sync now, on the watchlist card: it queues the batch sync through the
 * action behind the Queues page's "Sync watchlists" and toasts the outcome.
 * While sync is off the job would skip every member, and without Redis the
 * action refuses, so the button is disabled then and says why.
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { triggerWatchlistSyncJob } from "@/actions/admin/queue"
import { SyncNow } from "@/components/admin/watchlist/sync-now"

jest.mock("@/actions/admin/queue", () => ({ triggerWatchlistSyncJob: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const button = () => screen.getByTestId("admin-watchlist-sync-now")

beforeEach(() => jest.clearAllMocks())

describe("SyncNow", () => {
  it("queues the sync for every member through the Queues page's action, and says so", async () => {
    const user = userEvent.setup()
    jest.mocked(triggerWatchlistSyncJob).mockResolvedValue({ success: true, data: { jobId: "job-all" } })
    render(<SyncNow enabled redisConfigured />)

    expect(button()).toHaveAccessibleName("Sync now")
    expect(button()).toHaveAccessibleDescription("")
    await user.click(button())

    expect(triggerWatchlistSyncJob).toHaveBeenCalledWith({})
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Watchlist sync queued"))
    expect(mockShowError).not.toHaveBeenCalled()
  })

  it("shows the action's error, such as a queue that does not answer", async () => {
    const user = userEvent.setup()
    const unavailable = "The job queue is unavailable. Try again in a few minutes."
    jest.mocked(triggerWatchlistSyncJob).mockResolvedValue({ success: false, code: "UPSTREAM_UNAVAILABLE", error: unavailable })
    render(<SyncNow enabled redisConfigured />)

    await user.click(button())

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith(unavailable))
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })

  it("is disabled while sync is off, and says why", () => {
    render(<SyncNow enabled={false} redisConfigured />)

    expect(button()).toBeDisabled()
    expect(button()).toHaveAccessibleDescription("Sync now runs once watchlist sync is on.")
    expect(screen.getByTestId("admin-watchlist-sync-now-reason")).toBeVisible()
  })

  it("is disabled without Redis, and says why", () => {
    render(<SyncNow enabled redisConfigured={false} />)

    expect(button()).toBeDisabled()
    expect(button()).toHaveAccessibleDescription("Sync now needs Redis. Without it, the sync still runs on its interval.")
  })

  it("names sync being off first when both hold it back", () => {
    render(<SyncNow enabled={false} redisConfigured={false} />)

    expect(button()).toHaveAccessibleDescription("Sync now runs once watchlist sync is on.")
  })
})
