import { renderHook } from '@testing-library/react'

import { useLeaveGuard } from '@/hooks/use-leave-guard'

/** Whether the browser would ask before the tab closes or reloads: a `beforeunload` listener prevented the event. */
const leaveIsGuarded = () => {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('useLeaveGuard', () => {
  it('asks the browser to confirm leaving while active', () => {
    renderHook(() => useLeaveGuard(true))

    expect(leaveIsGuarded()).toBe(true)
  })

  it('does nothing while inactive', () => {
    renderHook(() => useLeaveGuard(false))

    expect(leaveIsGuarded()).toBe(false)
  })

  it('stops asking when active turns false, and asks again when it turns true', () => {
    const { rerender } = renderHook(({ active }) => useLeaveGuard(active), { initialProps: { active: true } })
    expect(leaveIsGuarded()).toBe(true)

    rerender({ active: false })
    expect(leaveIsGuarded()).toBe(false)

    rerender({ active: true })
    expect(leaveIsGuarded()).toBe(true)
  })

  it('stops asking when the component unmounts', () => {
    const { unmount } = renderHook(() => useLeaveGuard(true))
    expect(leaveIsGuarded()).toBe(true)

    unmount()

    expect(leaveIsGuarded()).toBe(false)
  })
})
