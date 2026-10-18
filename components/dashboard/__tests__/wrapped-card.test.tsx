/**
 * The dashboard Wrapped card toasts fixed copy when a polled generation fails,
 * never the stored error text (P0.9: RWP-02, SEC-17, DUP-01).
 */

import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import { getWrappedSettings } from '@/actions/admin'
import { generatePlexWrapped, getUserPlexWrapped } from '@/actions/users'
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
const mockShowInfo = jest.fn()
const toast = { showError: mockShowError, showInfo: mockShowInfo }

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

/**
 * The card opens the season year's route, never plain /wrapped and never the
 * calendar year (P0.14: RWP-04, RWV-02, UI-02).
 */
describe('WrappedCard season year', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2027-01-02T12:00:00Z'))
    jest.clearAllMocks()
    ;(useToast as jest.Mock).mockReturnValue(toast)
    ;(getWrappedSettings as jest.Mock).mockResolvedValue({ wrappedEnabled: true, wrappedYear: 2026 })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('links a completed Rewind to /wrapped/<season year> in January', async () => {
    ;(getUserPlexWrapped as jest.Mock).mockResolvedValue({ status: 'completed', error: null })

    render(<WrappedCard userId="user-1" memberSince="2020-01-01T00:00:00.000Z" />)

    expect(await screen.findByTestId('wrapped-card-view-link')).toHaveAttribute('href', '/wrapped/2026')
    expect(getUserPlexWrapped).toHaveBeenCalledWith('user-1', 2026)
    expect(getUserPlexWrapped).not.toHaveBeenCalledWith('user-1', 2027)
  })

  it('opens /wrapped/<season year> when a polled generation completes', async () => {
    ;(getUserPlexWrapped as jest.Mock)
      .mockResolvedValueOnce({ status: 'generating', error: null })
      .mockResolvedValue({ status: 'completed', error: null })

    await renderAndPollOnce()

    expect(mockRouter.push).toHaveBeenCalledWith('/wrapped/2026')
  })

  it('stays loading and reads nothing until the season year is known', async () => {
    ;(getWrappedSettings as jest.Mock).mockReturnValue(new Promise(() => {}))

    render(<WrappedCard userId="user-1" memberSince="2020-01-01T00:00:00.000Z" />)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000)
    })

    expect(screen.getByTestId('wrapped-card-loading')).toBeInTheDocument()
    expect(getUserPlexWrapped).not.toHaveBeenCalled()
  })

  it('offers a retry instead of loading forever when the settings fail to load', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    ;(getWrappedSettings as jest.Mock)
      .mockRejectedValueOnce(new Error('Failed to find Server Action'))
      .mockResolvedValue({ wrappedEnabled: true, wrappedYear: 2026 })
    ;(getUserPlexWrapped as jest.Mock).mockResolvedValue({ status: 'completed', error: null })

    try {
      render(<WrappedCard userId="user-1" memberSince="2020-01-01T00:00:00.000Z" />)

      expect(await screen.findByTestId('wrapped-card-error')).toBeInTheDocument()
      expect(screen.queryByTestId('wrapped-card-loading')).not.toBeInTheDocument()
      expect(getUserPlexWrapped).not.toHaveBeenCalled()

      fireEvent.click(screen.getByTestId('wrapped-card-error-retry'))

      expect(await screen.findByTestId('wrapped-card-view-link')).toHaveAttribute('href', '/wrapped/2026')
      expect(getWrappedSettings).toHaveBeenCalledTimes(2)
    } finally {
      consoleError.mockRestore()
    }
  })
})

/**
 * A refused generation shows the fixed copy for its code (never the server's
 * text), and a run that another tab already started is followed rather than
 * reported as an error (P0.12: SEC-22, RWP-12).
 */
describe('WrappedCard refused generation', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    ;(useToast as jest.Mock).mockReturnValue(toast)
    ;(getWrappedSettings as jest.Mock).mockResolvedValue({ wrappedEnabled: true, wrappedYear: 2026 })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  async function clickGenerate() {
    render(<WrappedCard userId="user-1" memberSince="2020-01-01T00:00:00.000Z" />)
    fireEvent.click(await screen.findByTestId('wrapped-card-generate'))
  }

  it('follows the run another tab started, then opens it', async () => {
    ;(getUserPlexWrapped as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: 'generating', error: null })
      .mockResolvedValue({ status: 'completed', error: null })
    ;(generatePlexWrapped as jest.Mock).mockResolvedValue({
      success: false,
      code: 'ALREADY_GENERATING',
      error: 'server text',
    })

    await clickGenerate()

    expect(await screen.findByTestId('wrapped-card-generating')).toBeInTheDocument()
    expect(mockShowInfo).toHaveBeenCalledWith('Your Rewind is already being made.')
    expect(mockShowError).not.toHaveBeenCalled()
    expect(generatePlexWrapped).toHaveBeenCalledWith('user-1', 2026)

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000)
    })

    expect(mockRouter.push).toHaveBeenCalledWith('/wrapped/2026')
  })

  it('says when the member can try again, and offers the button again', async () => {
    ;(getUserPlexWrapped as jest.Mock).mockResolvedValue(null)
    ;(generatePlexWrapped as jest.Mock).mockResolvedValue({
      success: false,
      code: 'RATE_LIMITED',
      retryAfterSec: 540,
      error: 'server text',
    })

    await clickGenerate()

    expect(await screen.findByTestId('wrapped-card-generate')).toBeEnabled()
    expect(mockShowError).toHaveBeenCalledWith('You can try again in 9 minutes.')
    expect(screen.queryByTestId('wrapped-card-generating')).not.toBeInTheDocument()
  })

  it('explains a missing entitlement', async () => {
    ;(getUserPlexWrapped as jest.Mock).mockResolvedValue(null)
    ;(generatePlexWrapped as jest.Mock).mockResolvedValue({
      success: false,
      code: 'NOT_ENTITLED',
      error: 'server text',
    })

    await clickGenerate()

    expect(await screen.findByTestId('wrapped-card-generate')).toBeEnabled()
    expect(mockShowError).toHaveBeenCalledWith(
      'Rewind is part of an active membership. Renew your subscription to make yours.'
    )
  })
})
