import { act, renderHook } from "@testing-library/react"

import { CONFIRM_FALLBACK_ERROR } from "@/components/ui/confirm-dialog"
import { useActionDialog } from "@/hooks/use-action-dialog"

const refresh = jest.fn()
const showSuccess = jest.fn()

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess }) }))

describe("useActionDialog", () => {
  beforeEach(() => jest.clearAllMocks())

  it("on success shows the toast, refreshes and returns no error", async () => {
    const action = jest.fn(async (id: string) => ({ success: true as const, data: id }))
    const { result } = renderHook(() => useActionDialog(action, { success: "Access removed" }))

    let outcome: { error?: string } = { error: "unset" }
    await act(async () => {
      outcome = await result.current.run("user-1")
    })

    expect(action).toHaveBeenCalledWith("user-1")
    expect(outcome).toEqual({})
    expect(showSuccess).toHaveBeenCalledWith("Access removed")
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("skips the refresh when refresh is false", async () => {
    const { result } = renderHook(() =>
      useActionDialog(async () => ({ success: true }), { success: "Saved", refresh: false })
    )
    await act(async () => {
      await result.current.run()
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it("returns the action's error without a toast or refresh", async () => {
    const { result } = renderHook(() =>
      useActionDialog(async () => ({ success: false, error: "Plex didn't answer." }), { success: "Saved" })
    )
    let outcome: { error?: string } = {}
    await act(async () => {
      outcome = await result.current.run()
    })
    expect(outcome).toEqual({ error: "Plex didn't answer." })
    expect(showSuccess).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("returns fixed copy when the action throws or fails without a message", async () => {
    const thrown = renderHook(() => useActionDialog(async () => Promise.reject(new Error("socket")), { success: "Saved" }))
    const silent = renderHook(() => useActionDialog(async () => ({ success: false }), { success: "Saved" }))
    let outcomes: Array<{ error?: string }> = []
    await act(async () => {
      outcomes = [await thrown.result.current.run(), await silent.result.current.run()]
    })
    expect(outcomes).toEqual([{ error: CONFIRM_FALLBACK_ERROR }, { error: CONFIRM_FALLBACK_ERROR }])
  })

  it("is pending while the action runs", async () => {
    let finish: () => void = () => {}
    const { result } = renderHook(() =>
      useActionDialog(() => new Promise<{ success: boolean }>((resolve) => (finish = () => resolve({ success: true }))), {
        success: "Saved",
      })
    )
    let running: Promise<unknown> = Promise.resolve()
    act(() => {
      running = result.current.run()
    })
    expect(result.current.isPending).toBe(true)
    await act(async () => {
      finish()
      await running
    })
    expect(result.current.isPending).toBe(false)
  })
})
