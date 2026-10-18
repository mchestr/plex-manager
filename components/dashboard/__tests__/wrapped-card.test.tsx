/**
 * The dashboard Wrapped card toasts fixed copy when a polled generation fails,
 * never the stored error text (P0.9: RWP-02, SEC-17, DUP-01).
 */

import { act, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import { getWrappedSettings } from '@/actions/admin'
import { getUserPlexWrapped } from '@/actions/users'
import { WrappedCard } from '@/components/dashboard/wrapped-card'
import { useToast } from '@/components/ui/toast'

jest.mock('@/actions/admin', () => ({
  getWrappedSettings: jest.fn(),
}))

jest.mock('@/actions/users', () => ({
  generatePlexWrapped: jest.fn(),
  getUserPlexWrapped: jest.fn(),
}))

jest.mock('@/components/ui/toast', () => ({
  useToast: jest.fn(),
}))

const mockRouter = { push: jest.fn() }
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}))

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, 'data-testid': testId }: { children?: ReactNode; className?: string; 'data-testid'?: string }) => (
      <div className={className} data-testid={testId}>{children}</div>
    ),
  },
}))

const mockShowError = jest.fn()
const toast = { showError: mockShowError }

const LEGACY_ROSTER_ERROR =
  'User not found in Tautulli. Plex User ID: 1, Email: me@example.com. Available users: olga_plex (olga.private@example.com), piet_plex (piet.private@example.com)'

function pollEndsWith(error: string) {
  ;(getUserPlexWrapped as jest.Mock)
    .mockResolvedValueOnce({ status: 'generating', error: null })
    .mockResolvedValue({ status: 'failed', error })
}

/** Render the card and run its 2 s status poll once, on fake timers. */
async function renderAndPollOnce() {
  render(<WrappedCard userId="user-1" memberSince="2020-01-01T00:00:00.000Z" />)
  expect(await screen.findByTestId('wrapped-card-generating')).toBeInTheDocument()
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2000)
  })
}

describe('WrappedCard poll toast', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    ;(useToast as jest.Mock).mockReturnValue(toast)
    ;(getWrappedSettings as jest.Mock).mockResolvedValue({ wrappedEnabled: true, wrappedYear: 2025 })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('toasts the fixed copy for a missing Tautulli account', async () => {
    pollEndsWith('{"code":"TAUTULLI_USER_NOT_FOUND"}')

    await renderAndPollOnce()

    expect(mockShowError).toHaveBeenCalledTimes(1)
    expect(mockShowError).toHaveBeenCalledWith(
      "We couldn't find your account in Tautulli yet. Ask the server admin to refresh Tautulli's user list."
    )
  })

  it('toasts generic copy for a legacy row and none of the stored roster', async () => {
    pollEndsWith(LEGACY_ROSTER_ERROR)

    await renderAndPollOnce()

    expect(mockShowError).toHaveBeenCalledTimes(1)
    expect(mockShowError).toHaveBeenCalledWith(
      'Something went wrong while generating your Wrapped. Please try again.'
    )
    const toasts = JSON.stringify(mockShowError.mock.calls)
    for (const value of ['olga_plex', 'olga.private@example.com', 'piet_plex', 'piet.private@example.com']) {
      expect(toasts).not.toContain(value)
    }
  })
})
