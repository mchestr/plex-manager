import fs from 'node:fs'
import path from 'node:path'

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

import { PlexCallbackPageClient } from '@/app/auth/callback/plex/callback-client'
import { finishPlexSignIn, pollPlexSignIn, startPlexSignIn } from '@/lib/plex-auth'
import { PLEX_SIGN_IN_COPY, type ShownPlexSignInCode } from '@/lib/plex-sign-in-codes'
import { RATE_LIMITED_MESSAGE } from '@/lib/security/rate-limit-messages'
import { redirectTo } from '@/lib/utils/navigation'

jest.mock('@/lib/plex-auth', () => ({
  pollPlexSignIn: jest.fn(),
  finishPlexSignIn: jest.fn(),
  startPlexSignIn: jest.fn(),
}))
// jsdom locks window.location, so the full-page redirect goes through this seam
jest.mock('@/lib/utils/navigation', () => ({ redirectTo: jest.fn() }))
jest.mock('next-auth/react', () => ({ signIn: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

const mockPoll = jest.mocked(pollPlexSignIn)
const mockFinish = jest.mocked(finishPlexSignIn)
const mockStart = jest.mocked(startPlexSignIn)
const mockSignIn = jest.mocked(signIn)
const mockRedirectTo = jest.mocked(redirectTo)
const mockPush = jest.fn()
const mockUseRouter = useRouter as jest.Mock

const CLIENT_FILE = path.join(process.cwd(), 'app/auth/callback/plex/callback-client.tsx')

function pollReturns(...statuses: Array<'waiting' | 'ready' | 'expired'>) {
  for (const status of statuses) {
    mockPoll.mockResolvedValueOnce({ success: true, data: { status } })
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUseRouter.mockReturnValue({ push: mockPush })
  mockSignIn.mockResolvedValue({ ok: true, error: null, status: 200, url: null })
  mockFinish.mockResolvedValue({ success: true, data: { next: '/' } })
  mockStart.mockResolvedValue({ success: true, data: { authUrl: 'https://app.plex.tv/auth#?code=NEW' } })
})

afterEach(() => {
  jest.useRealTimers()
})

describe('PlexCallbackPageClient', () => {
  it('never handles the Plex token: it imports neither getPlexAuthToken nor processInvite', () => {
    const source = fs.readFileSync(CLIENT_FILE, 'utf8')

    for (const name of ['getPlexAuthToken', 'processInvite', 'checkServerAccess', 'authToken']) {
      expect(source).not.toContain(name)
    }
  })

  it('shows the waiting state while plex.tv has not authorised the PIN, polling every 3 s', async () => {
    jest.useFakeTimers()
    mockPoll.mockResolvedValue({ success: true, data: { status: 'waiting' } })

    render(<PlexCallbackPageClient />)

    expect(screen.getByTestId('plex-callback-waiting')).toBeInTheDocument()
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0)
    })
    expect(mockPoll).toHaveBeenCalledTimes(1)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000)
    })
    expect(mockPoll).toHaveBeenCalledTimes(2)
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('gives up after 5 minutes', async () => {
    jest.useFakeTimers()
    mockPoll.mockResolvedValue({ success: true, data: { status: 'waiting' } })

    render(<PlexCallbackPageClient />)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5 * 60 * 1000)
    })

    expect(screen.getByTestId('plex-callback-error-plex_pin_expired')).toBeInTheDocument()
    expect(mockPoll).toHaveBeenCalledTimes(100)
  })

  it('signs in with no credentials once the PIN is ready, then goes where the server says', async () => {
    pollReturns('ready')
    mockFinish.mockResolvedValue({ success: true, data: { next: '/onboarding' } })

    render(<PlexCallbackPageClient />)

    await waitFor(() => expect(mockRedirectTo).toHaveBeenCalledWith('/onboarding'))
    expect(mockSignIn).toHaveBeenCalledWith('plex', { redirect: false })
    expect(mockFinish).toHaveBeenCalledTimes(1)
  })

  it('signs in once more when next-auth reported ok without a session (failed CSRF check)', async () => {
    pollReturns('ready')
    mockFinish
      .mockResolvedValueOnce({ success: false, code: 'UNAUTHENTICATED', error: 'Please sign in to continue.' })
      .mockResolvedValueOnce({ success: true, data: { next: '/' } })

    render(<PlexCallbackPageClient />)

    await waitFor(() => expect(mockRedirectTo).toHaveBeenCalledWith('/'))
    expect(mockSignIn).toHaveBeenCalledTimes(2)
    expect(mockFinish).toHaveBeenCalledTimes(2)
  })

  it('shows "Sign-in didn\'t finish" when the second sign-in sets no session either, never a silent redirect', async () => {
    pollReturns('ready')
    mockFinish.mockResolvedValue({ success: false, code: 'UNAUTHENTICATED', error: 'Please sign in to continue.' })

    render(<PlexCallbackPageClient />)

    expect(await screen.findByTestId('plex-callback-error-sign_in_failed')).toBeInTheDocument()
    expect(mockSignIn).toHaveBeenCalledTimes(2)
    expect(mockRedirectTo).not.toHaveBeenCalled()
  })

  it('sends a gated non-member to /subscribe', async () => {
    pollReturns('ready')
    mockFinish.mockResolvedValue({ success: true, data: { next: '/subscribe' } })

    render(<PlexCallbackPageClient />)

    await waitFor(() => expect(mockRedirectTo).toHaveBeenCalledWith('/subscribe'))
  })

  it('sends access_denied to the denied page', async () => {
    pollReturns('ready')
    mockSignIn.mockResolvedValue({ ok: false, error: 'access_denied', status: 401, url: null })

    render(<PlexCallbackPageClient />)

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth/denied'))
    expect(mockFinish).not.toHaveBeenCalled()
  })

  it('shows "Plex is temporarily unavailable" for plex_unavailable, never the denied page', async () => {
    pollReturns('ready')
    mockSignIn.mockResolvedValue({ ok: false, error: 'plex_unavailable', status: 401, url: null })

    render(<PlexCallbackPageClient />)

    expect(await screen.findByTestId('plex-callback-error-plex_unavailable')).toBeInTheDocument()
    expect(screen.getByTestId('plex-callback-error-heading')).toHaveTextContent('Plex is temporarily unavailable')
    expect(screen.getByText('Plex is temporarily unavailable. Try again in a minute.')).toBeInTheDocument()
    expect(screen.getByTestId('plex-callback-retry')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalledWith('/auth/denied')
  })

  it.each<[string, string, ShownPlexSignInCode]>([
    ['the PIN cookie is missing or expired', 'plex_pin_expired', 'plex_pin_expired'],
    ['the invite is refused', 'invite_invalid', 'invite_invalid'],
    ['the sign-in route is rate-limited', 'RateLimited', 'rate_limited'],
    ['anything else failed', 'CredentialsSignin', 'sign_in_failed'],
    ['the error is server text', 'Error: connect ECONNREFUSED db:5432', 'sign_in_failed'],
  ])('shows its copy when %s', async (_label, error, code) => {
    pollReturns('ready')
    mockSignIn.mockResolvedValue({ ok: false, error, status: 401, url: null })

    render(<PlexCallbackPageClient />)

    expect(await screen.findByTestId(`plex-callback-error-${code}`)).toBeInTheDocument()
    expect(screen.getByTestId('plex-callback-error-heading')).toHaveTextContent(PLEX_SIGN_IN_COPY[code].title)
    expect(screen.getByText(PLEX_SIGN_IN_COPY[code].message)).toBeInTheDocument()
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument()
  })

  it('shows "Sign-in didn\'t finish" for a browser without the PIN, without signing in', async () => {
    pollReturns('expired')

    render(<PlexCallbackPageClient />)

    expect(await screen.findByTestId('plex-callback-error-heading')).toHaveTextContent("Sign-in didn't finish")
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('shows the rate-limit copy when polling is limited', async () => {
    mockPoll.mockResolvedValue({ success: false, code: 'RATE_LIMITED', error: RATE_LIMITED_MESSAGE })

    render(<PlexCallbackPageClient />)

    expect(await screen.findByTestId('plex-callback-error-rate_limited')).toBeInTheDocument()
    expect(screen.getByText(RATE_LIMITED_MESSAGE)).toBeInTheDocument()
  })

  it('shows the waiting state as the one "Finishing sign-in" spinner', () => {
    mockPoll.mockReturnValue(new Promise(() => undefined))

    render(<PlexCallbackPageClient />)

    const waiting = screen.getByTestId('plex-callback-waiting')
    expect(waiting).toHaveAttribute('role', 'status')
    expect(waiting).toHaveTextContent('Finishing sign-in')
  })

  it('shows each failure as a StatusScreen with its code', async () => {
    pollReturns('expired')

    render(<PlexCallbackPageClient />)

    expect(await screen.findByTestId('status-screen')).toBeInTheDocument()
    expect(screen.getByTestId('status-screen-code')).toHaveTextContent('plex_pin_expired')
  })

  it('restarts the sign-in from Try again and goes straight to plex.tv', async () => {
    const user = userEvent.setup()
    pollReturns('expired')

    render(<PlexCallbackPageClient />)
    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(mockStart).toHaveBeenCalledTimes(1)
    // retry keeps the unfinished sign-in's invite code and callback path
    expect(mockStart).toHaveBeenCalledWith({ retry: true })
    await waitFor(() => expect(mockRedirectTo).toHaveBeenCalledWith('https://app.plex.tv/auth#?code=NEW'))
  })

  it('shows the rate-limit copy when the restart is refused', async () => {
    const user = userEvent.setup()
    pollReturns('expired')
    mockStart.mockResolvedValue({ success: false, code: 'RATE_LIMITED', error: RATE_LIMITED_MESSAGE })

    render(<PlexCallbackPageClient />)
    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByTestId('plex-callback-error-rate_limited')).toBeInTheDocument()
    expect(mockRedirectTo).not.toHaveBeenCalled()
  })

  it('offers only Go to home for a refused invite', async () => {
    pollReturns('ready')
    mockSignIn.mockResolvedValue({ ok: false, error: 'invite_invalid', status: 401, url: null })

    render(<PlexCallbackPageClient />)

    expect(await screen.findByRole('link', { name: 'Go to home' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('never renders a developer string', () => {
    const source = fs.readFileSync(CLIENT_FILE, 'utf8')

    expect(source).not.toMatch(/No PIN ID|error\.message/)
  })
})
