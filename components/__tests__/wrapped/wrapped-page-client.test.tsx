/**
 * The generating page polls through the shared status hook (P2.17, RWP-20)
 * and refreshes the server-rendered page once the run is over.
 */

import { act, render, screen } from '@testing-library/react'

import { getRewindStatus } from '@/actions/rewind-generation'
import { createQueryWrapper } from '@/__tests__/helpers/query-client'
import { WrappedPageClient } from '@/components/wrapped/wrapped-page-client'
import type { RewindStatus } from '@/lib/rewind/rewind-status'

jest.mock('@/actions/rewind-generation', () => ({ getRewindStatus: jest.fn() }))

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

jest.mock('@/components/generator/wrapped-generating-animation', () => ({
  WrappedGeneratingAnimation: ({ year }: { year: number }) => (
    <div data-testid="generating-animation">Generating {year} Wrapped</div>
  ),
}))

const getStatus = jest.mocked(getRewindStatus)

function status(state: RewindStatus['state'], hasCompleted = false): RewindStatus {
  return { state, errorCode: null, startedAt: null, hasCompleted }
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms)
  })
}

describe('WrappedPageClient', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('shows the animation while the run is active, then refreshes once it completes', async () => {
    getStatus.mockResolvedValueOnce(status('running')).mockResolvedValue(status('completed', true))

    render(<WrappedPageClient userId="user-1" year={2024} />, { wrapper: createQueryWrapper() })

    expect(screen.getByTestId('generating-animation')).toHaveTextContent('Generating 2024 Wrapped')
    await advance(0)
    expect(mockRefresh).not.toHaveBeenCalled()

    // TanStack Query applies a result on the next tick, so one millisecond past the poll.
    await advance(3_001)

    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('generating-animation')).not.toBeInTheDocument()
  })

  it('refreshes when the run has already failed', async () => {
    getStatus.mockResolvedValue(status('failed'))

    render(<WrappedPageClient userId="user-1" year={2024} />, { wrapper: createQueryWrapper() })
    await advance(0)

    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it("reads the member's status by id, for an admin", async () => {
    getStatus.mockResolvedValue(status('queued'))

    render(<WrappedPageClient userId="member-1" year={2026} />, { wrapper: createQueryWrapper() })
    await advance(0)

    expect(getStatus).toHaveBeenCalledWith({ year: 2026, userId: 'member-1' })
    expect(screen.getByTestId('generating-animation')).toBeInTheDocument()
  })
})
