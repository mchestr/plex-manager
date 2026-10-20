/**
 * The dashboard Rewind card on the one status poll (P2.17): fixed copy for a
 * failure (P0.9), the season year (P0.14), refusals (P0.12), eligibility
 * (P0.17), and the generating, taking-longer and FR-50 unavailable states.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { getWrappedSettings } from '@/actions/admin'
import { getRewindStatus, requestRewindGeneration } from '@/actions/rewind-generation'
import { createQueryWrapper } from '@/__tests__/helpers/query-client'
import { WrappedCard } from '@/components/dashboard/wrapped-card'
import { useToast } from '@/components/ui/toast'
import type { RewindStatus } from '@/lib/rewind/rewind-status'

jest.mock('@/actions/admin', () => ({ getWrappedSettings: jest.fn() }))
jest.mock('@/actions/rewind-generation', () => ({
  getRewindStatus: jest.fn(),
  requestRewindGeneration: jest.fn(),
}))
jest.mock('@/components/ui/toast', () => ({ useToast: jest.fn() }))

const mockRouter = { push: jest.fn(), refresh: jest.fn() }
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }))

jest.mock('motion/react', () => ({
  motion: {
    div: ({ children, className, 'data-testid': testId }: { children?: ReactNode; className?: string; 'data-testid'?: string }) => (
      <div className={className} data-testid={testId}>{children}</div>
    ),
  },
  useReducedMotion: () => false,
}))

const ELIGIBLE = { eligible: true } as const

const mockShowError = jest.fn()
const mockShowInfo = jest.fn()
const toast = { showError: mockShowError, showInfo: mockShowInfo }

const getStatus = jest.mocked(getRewindStatus)
const requestGeneration = jest.mocked(requestRewindGeneration)

/** What getRewindStatus returns for a status. */
function status(state: RewindStatus['state'], extra: Partial<RewindStatus> = {}) {
  return { success: true as const, data: { state, errorCode: null, startedAt: null, hasCompleted: false, ...extra } }
}

function renderCard(props: Partial<Parameters<typeof WrappedCard>[0]> = {}) {
  return render(
    <WrappedCard userId="user-1" memberLongEnough rewindEligibility={ELIGIBLE} {...props} />,
    { wrapper: createQueryWrapper() }
  )
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  getStatus.mockReset()
  ;(useToast as jest.Mock).mockReturnValue(toast)
  ;(getWrappedSettings as jest.Mock).mockResolvedValue({ wrappedEnabled: true, wrappedYear: 2026 })
})

afterEach(() => {
  jest.useRealTimers()
})

describe('WrappedCard states', () => {
  it('shows the generating state while a run is queued, then the taking-longer copy after 10 minutes', async () => {
    getStatus.mockResolvedValue(status('queued'))

    renderCard()

    expect(await screen.findByTestId('wrapped-card-generating')).toBeInTheDocument()
    expect(screen.queryByTestId('wrapped-card-slow')).not.toBeInTheDocument()

    await advance(10 * 60 * 1000)

    expect(screen.getByTestId('wrapped-card-slow')).toHaveTextContent('This is taking longer than usual')
  })

  it('keeps a completed Rewind on show while an admin regenerates it (FR-40)', async () => {
    getStatus.mockResolvedValue(status('running', { hasCompleted: true }))

    renderCard()

    expect(await screen.findByTestId('wrapped-card-view-link')).toHaveAttribute('href', '/wrapped/2026')
    expect(screen.queryByTestId('wrapped-card-generating')).not.toBeInTheDocument()
  })

  it.each([
    ['REDIS_NOT_CONFIGURED', false, "Rewind isn't available on this server yet"],
    ['REDIS_NOT_CONFIGURED', true, 'Rewind needs Redis (REDIS_URL)'],
    ['REDIS_UNAVAILABLE', false, 'Rewind is temporarily unavailable. Try again in a few minutes.'],
  ] as const)('explains %s (admin: %s) with no Generate button', async (code, isAdmin, copy) => {
    getStatus.mockResolvedValue(status('unavailable', { errorCode: code }))

    renderCard({ isAdmin })

    expect(await screen.findByTestId('wrapped-card-unavailable')).toHaveTextContent(copy)
    expect(screen.queryByTestId('wrapped-card-generate')).not.toBeInTheDocument()
  })

  it('shows fixed copy for a failed run, and a retry', async () => {
    getStatus.mockResolvedValue(status('failed', { errorCode: 'TAUTULLI_USER_NOT_FOUND' }))

    renderCard()

    expect(await screen.findByTestId('wrapped-card-failed-message')).toHaveTextContent(
      "We couldn't find your account in Tautulli yet. Ask the server admin to refresh Tautulli's user list."
    )
    expect(screen.getByTestId('wrapped-card-retry')).toBeEnabled()
  })

  it('opens /wrapped/<season year> in January, and reads the season year only', async () => {
    jest.setSystemTime(new Date('2027-01-02T12:00:00Z'))
    getStatus.mockResolvedValue(status('completed', { hasCompleted: true }))

    renderCard()

    expect(await screen.findByTestId('wrapped-card-view-link')).toHaveAttribute('href', '/wrapped/2026')
    expect(getStatus).toHaveBeenCalledWith({ year: 2026 })
  })

  it('stays loading and reads nothing until the season year is known', async () => {
    ;(getWrappedSettings as jest.Mock).mockReturnValue(new Promise(() => {}))

    renderCard()
    await advance(5000)

    expect(screen.getByTestId('wrapped-card-loading')).toBeInTheDocument()
    expect(getStatus).not.toHaveBeenCalled()
  })

  it('offers a retry instead of loading forever when the settings fail to load', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    ;(getWrappedSettings as jest.Mock)
      .mockRejectedValueOnce(new Error('Failed to find Server Action'))
      .mockResolvedValue({ wrappedEnabled: true, wrappedYear: 2026 })
    getStatus.mockResolvedValue(status('completed', { hasCompleted: true }))

    try {
      renderCard()

      expect(await screen.findByTestId('wrapped-card-error')).toBeInTheDocument()
      expect(getStatus).not.toHaveBeenCalled()

      fireEvent.click(screen.getByTestId('wrapped-card-error-retry'))

      expect(await screen.findByTestId('wrapped-card-view-link')).toHaveAttribute('href', '/wrapped/2026')
    } finally {
      consoleError.mockRestore()
    }
  })
})

describe('WrappedCard generation requests', () => {
  async function clickGenerate() {
    renderCard()
    fireEvent.click(await screen.findByTestId('wrapped-card-generate'))
  }

  it('requests the season year and follows the run until it completes', async () => {
    const replies = [status('none'), status('queued'), status('running')]
    getStatus.mockImplementation(async () => replies.shift() ?? status('completed', { hasCompleted: true }))
    requestGeneration.mockResolvedValue({ success: true, data: { alreadyQueued: false } })

    await clickGenerate()

    expect(await screen.findByTestId('wrapped-card-generating')).toBeInTheDocument()
    expect(requestGeneration).toHaveBeenCalledWith({ year: 2026 })

    await advance(10_000)

    expect(screen.getByTestId('wrapped-card-view-link')).toBeInTheDocument()
    expect(mockRouter.refresh).toHaveBeenCalled()
  })

  it('follows the run another tab started', async () => {
    getStatus.mockResolvedValueOnce(status('none')).mockResolvedValue(status('running'))
    requestGeneration.mockResolvedValue({ success: true, data: { alreadyQueued: true } })

    await clickGenerate()

    expect(await screen.findByTestId('wrapped-card-generating')).toBeInTheDocument()
    expect(mockShowInfo).toHaveBeenCalledWith('Your Rewind is already being made.')
    expect(mockShowError).not.toHaveBeenCalled()
  })

  it('says when the member can try again, and offers the button again', async () => {
    getStatus.mockResolvedValue(status('none'))
    requestGeneration.mockResolvedValue({
      success: false,
      code: 'RATE_LIMITED',
      retryAfterSec: 540,
      error: 'server text',
    })

    await clickGenerate()

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('You can try again in 9 minutes.'))
    expect(await screen.findByTestId('wrapped-card-generate')).toBeEnabled()
  })

  it('explains a missing entitlement', async () => {
    getStatus.mockResolvedValue(status('none'))
    requestGeneration.mockResolvedValue({ success: false, code: 'NOT_ENTITLED', error: 'server text' })

    await clickGenerate()

    await waitFor(() =>
      expect(mockShowError).toHaveBeenCalledWith(
        'Rewind is part of an active membership. Renew your subscription to make yours.'
      )
    )
  })

  it('shows the FR-50 message the action returns when Redis went down', async () => {
    getStatus.mockResolvedValue(status('none'))
    requestGeneration.mockResolvedValue({
      success: false,
      code: 'REDIS_UNAVAILABLE',
      error: 'Rewind is temporarily unavailable. Try again in a few minutes.',
    })

    await clickGenerate()

    await waitFor(() =>
      expect(mockShowError).toHaveBeenCalledWith('Rewind is temporarily unavailable. Try again in a few minutes.')
    )
  })
})

/**
 * A member without Plex watch history sees an explanation, not a Generate
 * button that always fails (P0.17: RWP-08, FR-48).
 */
describe('WrappedCard eligibility', () => {
  const COPY = 'Rewind needs Plex watch history. Jellyfin support is planned.'

  it.each([
    ['NO_PLEX_IDENTITY', true],
    ['NO_TAUTULLI_MATCH', true],
    // Joined last month: the explanation shows regardless of the six-month rule.
    ['NO_PLEX_IDENTITY', false],
  ] as const)('explains Rewind to an ineligible member (%s, member long enough: %s), with no action', async (reason, memberLongEnough) => {
    renderCard({ memberLongEnough, rewindEligibility: { eligible: false, reason } })

    const card = await screen.findByTestId('wrapped-card-not-eligible')
    expect(card).toHaveTextContent('Rewind 2026')
    expect(card).toHaveTextContent(COPY)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(getStatus).not.toHaveBeenCalled()
  })

  it('shows nothing to an ineligible member while Rewind is disabled', async () => {
    ;(getWrappedSettings as jest.Mock).mockResolvedValue({ wrappedEnabled: false, wrappedYear: 2026 })

    const { container } = renderCard({ rewindEligibility: { eligible: false, reason: 'NO_PLEX_IDENTITY' } })

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('explains Rewind once the action finds a member the page rendered as eligible ineligible', async () => {
    getStatus.mockResolvedValue(status('none'))
    requestGeneration.mockResolvedValue({ success: false, code: 'REWIND_NOT_ELIGIBLE', error: 'server text' })

    renderCard()
    fireEvent.click(await screen.findByTestId('wrapped-card-generate'))

    const card = await screen.findByTestId('wrapped-card-not-eligible')
    expect(card).toHaveTextContent(COPY)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(mockShowError).not.toHaveBeenCalled()
  })

  it('shows nothing to an eligible member who joined under six months ago (decided on the server)', async () => {
    getStatus.mockResolvedValue(status('none'))

    const { container } = renderCard({ memberLongEnough: false })

    await waitFor(() => expect(getWrappedSettings).toHaveBeenCalled())
    await advance(0)
    expect(container).toBeEmptyDOMElement()
  })
})
