/**
 * "Refresh data now" (UX 8.6, 8.9, 4.1.4, TS 9.5): the action, its toasts,
 * the `loading` state with "Reading" until the queued read ends, and the
 * disabled state without Redis with the reason as the description.
 */

import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { refreshCleanupData } from "@/actions/admin/cleanup-settings"
import { READ_WAIT_MS, RefreshDataButton } from "@/components/admin/cleanup/page/refresh-data-button"

jest.mock("@/actions/admin/cleanup-settings", () => ({ refreshCleanupData: jest.fn() }))
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const button = () => screen.getByTestId("admin-cleanup-refresh-data")

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(refreshCleanupData).mockResolvedValue({ success: true, data: { queued: true } })
})

describe("RefreshDataButton", () => {
  it("starts a read, toasts, and shows Reading until the read that it queued ends", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<RefreshDataButton redis />)
    expect(button()).toHaveTextContent("Refresh data now")
    await user.click(button())
    expect(refreshCleanupData).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Library read started"))
    expect(button()).toHaveAttribute("aria-busy", "true")

    rerender(<RefreshDataButton redis reading />)
    expect(button()).toHaveAttribute("aria-busy", "true")
    rerender(<RefreshDataButton redis reading={false} />)
    expect(button()).not.toHaveAttribute("aria-busy")
  })

  it("stops showing Reading after the wait when no read starts", async () => {
    jest.useFakeTimers()
    try {
      render(<RefreshDataButton redis />)
      await act(async () => {
        button().click()
      })
      expect(button()).toHaveAttribute("aria-busy", "true")
      act(() => jest.advanceTimersByTime(READ_WAIT_MS))
      expect(button()).not.toHaveAttribute("aria-busy")
    } finally {
      jest.useRealTimers()
    }
  })

  it("shows a refusal in an error toast and stays ready", async () => {
    const user = userEvent.setup()
    jest.mocked(refreshCleanupData).mockResolvedValueOnce({ success: false, code: "CONFLICT", error: "A run is in progress. Try again in a few minutes." })
    render(<RefreshDataButton redis variant="outline" size="default" data-testid="admin-cleanup-settings-refresh-data" />)
    await user.click(screen.getByTestId("admin-cleanup-settings-refresh-data"))
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("A run is in progress. Try again in a few minutes."))
    expect(mockShowSuccess).not.toHaveBeenCalled()
    expect(screen.getByTestId("admin-cleanup-settings-refresh-data")).not.toHaveAttribute("aria-busy")
  })

  it("shows Reading while a read holds its claim", () => {
    render(<RefreshDataButton redis reading />)
    expect(button()).toHaveAttribute("aria-busy", "true")
    expect(button()).toHaveTextContent("Reading")
  })

  it("is disabled without Redis, keeps focus and says why", async () => {
    const user = userEvent.setup()
    render(<RefreshDataButton redis={false} reading />)
    expect(button()).toHaveAttribute("aria-disabled", "true")
    expect(button()).not.toHaveAttribute("aria-busy")
    expect(button()).toHaveAccessibleDescription("Redis is not set up. Library reads and runs need the job queue.")
    await user.tab()
    expect(button()).toHaveFocus()
    await user.click(button())
    expect(refreshCleanupData).not.toHaveBeenCalled()
  })
})
