/**
 * The one Rewind status poll (P2.17, RWP-20): every 3 s while a run is queued
 * or running, backing off to 15 s, giving up at 10 minutes, and refreshing the
 * page when a watched run finishes.
 */

import { act, renderHook } from '@testing-library/react'

import { getRewindStatus } from '@/actions/rewind-generation'
import { createQueryWrapper } from '@/__tests__/helpers/query-client'
import { useRewindStatus } from '@/hooks/use-rewind-status'
import type { RewindStatus } from '@/lib/rewind/rewind-status'

jest.mock('@/actions/rewind-generation', () => ({ getRewindStatus: jest.fn() }))

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

const getStatus = jest.mocked(getRewindStatus)
const GIVE_UP_MS = 10 * 60 * 1000

/** What getRewindStatus returns for a status. */
function status(state: RewindStatus['state'], hasCompleted = false) {
  return { success: true as const, data: { state, errorCode: null, startedAt: null, hasCompleted } }
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms)
  })
}

function renderStatusHook(year: number | null = 2026, userId?: string) {
  return renderHook(() => useRewindStatus(year, { userId }), { wrapper: createQueryWrapper() })
}

describe('useRewindStatus', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('stays idle without a year', async () => {
    const { result } = renderStatusHook(null)
    await advance(10_000)

    expect(getStatus).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
  })

  it('reads once and does not poll when no run is active', async () => {
    getStatus.mockResolvedValue(status('completed', true))

    const { result } = renderStatusHook()
    await advance(0)
    await advance(60_000)

    expect(result.current.status).toEqual(status('completed', true).data)
    expect(getStatus).toHaveBeenCalledTimes(1)
    expect(getStatus).toHaveBeenCalledWith({ year: 2026 })
  })

  it('passes an admin-chosen member id', async () => {
    getStatus.mockResolvedValue(status('none'))

    renderStatusHook(2026, 'member-1')
    await advance(0)

    expect(getStatus).toHaveBeenCalledWith({ year: 2026, userId: 'member-1' })
  })

  it('polls every 3 s while running, then backs off to 15 s', async () => {
    const at: number[] = []
    getStatus.mockImplementation(async () => {
      at.push(Date.now())
      return status('running')
    })

    renderStatusHook()
    await advance(0)
    await advance(200_000)

    const gaps = at.slice(1).map((time, i) => time - at[i])
    expect(gaps.slice(0, 3)).toEqual([3_000, 3_750, 4_688])
    expect(gaps.every((gap, i) => i === 0 || gap >= gaps[i - 1])).toBe(true)
    expect(gaps.at(-1)).toBe(15_000)
  })

  it('refreshes the page when the watched run completes, and stops polling', async () => {
    const at: number[] = []
    const replies = [status('queued'), status('running')]
    getStatus.mockImplementation(async () => {
      at.push(Date.now())
      return replies.shift() ?? status('completed', true)
    })

    const { result } = renderStatusHook()
    await advance(0)
    await advance(10_000)

    expect(result.current.status?.state).toBe('completed')
    expect(mockRefresh).toHaveBeenCalledTimes(1)

    const calls = getStatus.mock.calls.length
    await advance(60_000)
    expect(getStatus).toHaveBeenCalledTimes(calls)
  })

  it('does not refresh for a status it never saw running', async () => {
    getStatus.mockResolvedValue(status('failed'))

    renderStatusHook()
    await advance(0)

    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('gives up after 10 minutes with a taking-longer state', async () => {
    getStatus.mockResolvedValue(status('running'))

    const { result } = renderStatusHook()
    await advance(0)
    await advance(GIVE_UP_MS - 1)
    expect(result.current.isSlow).toBe(false)

    await advance(1)
    expect(result.current.isSlow).toBe(true)
    const calls = getStatus.mock.calls.length
    await advance(60_000)
    expect(getStatus).toHaveBeenCalledTimes(calls)
  })

  it('starts watching again on track()', async () => {
    getStatus.mockResolvedValue(status('none'))

    const { result } = renderStatusHook()
    await advance(0)
    getStatus.mockResolvedValue(status('queued'))

    await act(async () => {
      await result.current.track()
    })
    expect(result.current.status?.state).toBe('queued')

    await advance(3_000)
    expect(getStatus).toHaveBeenCalledTimes(3)
  })

  it('reports an error result as an error', async () => {
    getStatus.mockResolvedValue({ success: false, code: 'UNAUTHENTICATED', error: 'Unauthorized' })

    const { result } = renderStatusHook()
    await advance(0)

    expect(result.current.error?.message).toBe('Unauthorized')
    expect(result.current.status).toBeNull()
  })
})
