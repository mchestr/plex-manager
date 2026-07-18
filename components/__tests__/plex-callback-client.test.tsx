import { render, screen, waitFor } from '@testing-library/react'

import { PlexCallbackPageClient } from '@/app/auth/callback/plex/callback-client'
import { checkServerAccess, isSubscriptionGatingEnabled } from '@/actions/auth'
import { processInvite } from '@/actions/invite'
import { getOnboardingStatus } from '@/actions/onboarding'
import { getPlexAuthToken } from '@/lib/plex-auth'
import { redirectTo } from '@/lib/utils/navigation'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

jest.mock('@/actions/auth', () => ({
  checkServerAccess: jest.fn(),
  isSubscriptionGatingEnabled: jest.fn(),
}))

jest.mock('@/actions/invite', () => ({
  processInvite: jest.fn(),
}))

jest.mock('@/actions/onboarding', () => ({
  getOnboardingStatus: jest.fn(),
}))

jest.mock('@/lib/plex-auth', () => ({
  getPlexAuthToken: jest.fn(),
}))

// Navigation is a thin, mockable seam — jsdom locks window.location, so we mock
// the helper module instead of the global to observe full-page redirects.
jest.mock('@/lib/utils/navigation', () => ({
  redirectTo: jest.fn(),
}))

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
  getSession: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}))

const mockCheckServerAccess = checkServerAccess as jest.Mock
const mockIsSubscriptionGatingEnabled = isSubscriptionGatingEnabled as jest.Mock
const mockProcessInvite = processInvite as jest.Mock
const mockGetOnboardingStatus = getOnboardingStatus as jest.Mock
const mockGetPlexAuthToken = getPlexAuthToken as jest.Mock
const mockRedirectTo = redirectTo as jest.Mock
const mockSignIn = signIn as jest.Mock
const mockUseRouter = useRouter as jest.Mock
const mockUseSearchParams = useSearchParams as jest.Mock

const mockPush = jest.fn()

/**
 * Wire up the standard regular-login search params (a pin id, no invite/test
 * token) unless overridden.
 */
function setSearchParams(params: Record<string, string | null> = {}) {
  const defaults: Record<string, string | null> = {
    plexPinId: 'pin-123',
    inviteCode: null,
    testToken: null,
  }
  const merged = { ...defaults, ...params }
  mockUseSearchParams.mockReturnValue({
    get: (key: string) => merged[key] ?? null,
  })
}

describe('PlexCallbackPageClient — Stripe subscription gating', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseRouter.mockReturnValue({ push: mockPush })
    mockGetPlexAuthToken.mockResolvedValue('user-token')
    setSearchParams()
  })

  it('routes a gated non-member to /subscribe when Stripe gating is enabled', async () => {
    // Clean "no access" result (success: true) + gating on → relaxed sign-in.
    mockCheckServerAccess.mockResolvedValue({ success: true, hasAccess: false })
    mockIsSubscriptionGatingEnabled.mockResolvedValue(true)
    mockSignIn.mockResolvedValue({ ok: true })

    render(<PlexCallbackPageClient />)

    await waitFor(
      () => {
        expect(mockRedirectTo).toHaveBeenCalledWith('/subscribe')
      },
      { timeout: 3000 }
    )

    expect(mockIsSubscriptionGatingEnabled).toHaveBeenCalledTimes(1)
    expect(mockSignIn).toHaveBeenCalledWith('plex', {
      authToken: 'user-token',
      redirect: false,
    })
    // A gated non-member must not be sent through onboarding/home.
    expect(mockGetOnboardingStatus).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalledWith('/auth/denied')
  })

  it('denies a non-member (no sign-in) when Stripe gating is disabled', async () => {
    mockCheckServerAccess.mockResolvedValue({ success: true, hasAccess: false })
    mockIsSubscriptionGatingEnabled.mockResolvedValue(false)

    render(<PlexCallbackPageClient />)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/auth/denied')
    })

    expect(mockSignIn).not.toHaveBeenCalled()
    expect(mockRedirectTo).not.toHaveBeenCalled()
  })

  it('denies without consulting the gate when the access check itself failed', async () => {
    // A failed check (success: false) is always fatal — we must never admit a
    // user whose access we could not actually determine, even if gating is on.
    mockCheckServerAccess.mockResolvedValue({
      success: false,
      hasAccess: false,
      error: 'Plex API error',
    })

    render(<PlexCallbackPageClient />)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/auth/denied')
    })

    expect(mockIsSubscriptionGatingEnabled).not.toHaveBeenCalled()
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('does not gate a member (regression): signs in and follows the normal flow', async () => {
    mockCheckServerAccess.mockResolvedValue({ success: true, hasAccess: true })
    mockSignIn.mockResolvedValue({ ok: true })
    mockGetOnboardingStatus.mockResolvedValue({ isComplete: true })

    render(<PlexCallbackPageClient />)

    await waitFor(
      () => {
        expect(mockRedirectTo).toHaveBeenCalledWith('/')
      },
      { timeout: 3000 }
    )

    // A member with access never triggers the subscription gate.
    expect(mockIsSubscriptionGatingEnabled).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalledWith('/auth/denied')
    expect(mockSignIn).toHaveBeenCalledTimes(1)
  })

  it('sends a member with incomplete onboarding to /onboarding (regression)', async () => {
    mockCheckServerAccess.mockResolvedValue({ success: true, hasAccess: true })
    mockSignIn.mockResolvedValue({ ok: true })
    mockGetOnboardingStatus.mockResolvedValue({ isComplete: false })

    render(<PlexCallbackPageClient />)

    await waitFor(
      () => {
        expect(mockRedirectTo).toHaveBeenCalledWith('/onboarding')
      },
      { timeout: 3000 }
    )

    expect(mockIsSubscriptionGatingEnabled).not.toHaveBeenCalled()
  })

  it('lets an invite redeemer proceed as a member when gating is on and access has not propagated', async () => {
    // processInvite already invited + auto-accepted the user and marked them
    // exempt, so a clean "no access" (plex.tv propagation lag) must not gate
    // them to /subscribe — they follow the normal member flow.
    setSearchParams({ inviteCode: 'ABCD2345' })
    mockProcessInvite.mockResolvedValue({ success: true })
    mockCheckServerAccess.mockResolvedValue({ success: true, hasAccess: false })
    mockIsSubscriptionGatingEnabled.mockResolvedValue(true)
    mockSignIn.mockResolvedValue({ ok: true })
    mockGetOnboardingStatus.mockResolvedValue({ isComplete: false })

    render(<PlexCallbackPageClient />)

    await waitFor(
      () => {
        expect(mockRedirectTo).toHaveBeenCalledWith('/onboarding')
      },
      { timeout: 3000 }
    )

    expect(mockProcessInvite).toHaveBeenCalledWith('ABCD2345', 'user-token')
    expect(mockRedirectTo).not.toHaveBeenCalledWith('/subscribe')
    expect(mockPush).not.toHaveBeenCalledWith('/auth/denied')
  })

  it('still denies an invite redeemer without access when gating is disabled', async () => {
    setSearchParams({ inviteCode: 'ABCD2345' })
    mockProcessInvite.mockResolvedValue({ success: true })
    mockCheckServerAccess.mockResolvedValue({ success: true, hasAccess: false })
    mockIsSubscriptionGatingEnabled.mockResolvedValue(false)

    render(<PlexCallbackPageClient />)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/auth/denied')
    })

    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('shows an error and does not redirect when the gated sign-in fails', async () => {
    mockCheckServerAccess.mockResolvedValue({ success: true, hasAccess: false })
    mockIsSubscriptionGatingEnabled.mockResolvedValue(true)
    mockSignIn.mockResolvedValue({ ok: false, error: 'Sign in failed' })

    render(<PlexCallbackPageClient />)

    await waitFor(() => {
      expect(screen.getByText('Sign in failed')).toBeInTheDocument()
    })

    expect(mockRedirectTo).not.toHaveBeenCalled()
  })
})
