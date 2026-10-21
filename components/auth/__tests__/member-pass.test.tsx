import { act, fireEvent, render, screen } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'

import { MemberPass } from '@/components/auth/member-pass'
import { startPlexSignIn } from '@/lib/plex-auth'
import { RATE_LIMITED_MESSAGE } from '@/lib/security/rate-limit-messages'
import { redirectTo } from '@/lib/utils/navigation'

expect.extend(toHaveNoViolations)

jest.mock('@/lib/plex-auth', () => ({ startPlexSignIn: jest.fn() }))
// jsdom locks window.location, so the redirect goes through this seam
jest.mock('@/lib/utils/navigation', () => ({ redirectTo: jest.fn() }))
jest.mock('next-auth/react', () => ({ signIn: jest.fn() }))

const mockStart = jest.mocked(startPlexSignIn)
const mockRedirectTo = jest.mocked(redirectTo)
const AUTH_URL = 'https://app.plex.tv/auth#?code=ABC123'

function renderPass(props: Partial<Parameters<typeof MemberPass>[0]> = {}) {
  return render(
    <main>
      <MemberPass serverName="Northfield Plex" monogram="N" plex jellyfin={false} {...props} />
    </main>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockStart.mockResolvedValue({ success: true, data: { authUrl: AUTH_URL } })
})

afterEach(() => {
  jest.useRealTimers()
})

describe('MemberPass', () => {
  it('has one h1 that names the server, and no axe violations', async () => {
    jest.useRealTimers()
    const { container } = renderPass({ jellyfin: true })

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in to Northfield Plex')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('goes to plex.tv after one click, with no setTimeout scheduled (UI-35)', async () => {
    jest.useFakeTimers()
    renderPass()
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout')

    await act(async () => {
      fireEvent.click(screen.getByTestId('sign-in-button'))
    })

    expect(mockStart).toHaveBeenCalledTimes(1)
    expect(mockStart).toHaveBeenCalledWith({})
    expect(mockRedirectTo).toHaveBeenCalledWith(AUTH_URL)
    // No forced wait before plex.tv
    expect(setTimeoutSpy).not.toHaveBeenCalled()
    setTimeoutSpy.mockRestore()
  })

  it('passes the callback path to the server', async () => {
    renderPass({ callbackUrl: '/admin' })

    await act(async () => {
      fireEvent.click(screen.getByTestId('sign-in-button'))
    })

    expect(mockStart).toHaveBeenCalledWith({ callbackPath: '/admin' })
  })

  it('shows a refusal and stays on the page', async () => {
    mockStart.mockResolvedValue({ success: false, code: 'RATE_LIMITED', error: RATE_LIMITED_MESSAGE })
    renderPass()

    await act(async () => {
      fireEvent.click(screen.getByTestId('sign-in-button'))
    })

    expect(screen.getByTestId('sign-in-error')).toHaveTextContent(RATE_LIMITED_MESSAGE)
    expect(mockRedirectTo).not.toHaveBeenCalled()
    expect(screen.getByTestId('sign-in-button')).not.toBeDisabled()
  })

  it('shows fixed copy, not the exception, when the action throws', async () => {
    mockStart.mockRejectedValue(new Error("Can't reach database server at db:5432"))
    renderPass()

    await act(async () => {
      fireEvent.click(screen.getByTestId('sign-in-button'))
    })

    expect(screen.getByTestId('sign-in-error')).toHaveTextContent("We couldn't reach Plex")
    expect(screen.queryByText(/db:5432/)).not.toBeInTheDocument()
  })

  it('offers Jellyfin only when it is enabled, revealed in place with aria-expanded', () => {
    const { unmount } = renderPass()
    expect(screen.queryByTestId('toggle-jellyfin')).not.toBeInTheDocument()
    unmount()

    renderPass({ jellyfin: true })
    const toggle = screen.getByTestId('toggle-jellyfin')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('jellyfin-sign-in-form')).not.toBeInTheDocument()

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('jellyfin-sign-in-form')).toBeInTheDocument()
    expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).toContainElement(
      screen.getByTestId('jellyfin-sign-in-form')
    )
  })

  it('shows the Jellyfin form as the only option without Plex', () => {
    renderPass({ plex: false, jellyfin: true })

    expect(screen.queryByTestId('sign-in-button')).not.toBeInTheDocument()
    expect(screen.getByTestId('jellyfin-sign-in-form')).toBeInTheDocument()
  })

  it('says the Plex token is kept, and carries the privacy notice (GAP-34)', () => {
    renderPass()

    expect(screen.getByTestId('member-pass-token-copy')).toHaveTextContent(
      "You'll approve access on plex.tv. Northfield Plex keeps your Plex sign-in token to sync your watchlist and accept invites for you."
    )
    expect(screen.getByTestId('member-pass-privacy')).toHaveTextContent(
      'Server admins can see your watch activity and your Rewind. Some Rewind text is written by an AI service.'
    )
  })

  it('prints the stub with no counts', () => {
    renderPass()

    expect(screen.getByText('Member pass')).toBeInTheDocument()
    expect(screen.getByText('Good for every account on the share')).toBeInTheDocument()
    expect(screen.getByText('Not a member yet? Ask the server owner for an invite link.')).toBeInTheDocument()
  })
})
