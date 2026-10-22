/**
 * The `(app)` layout's onboarding guard, and its entitlement guard (P4.5): level-aware, with the path
 * from the `x-pm-pathname` header proxy.ts sets. The level table itself is in
 * __tests__/lib/access.test.ts.
 */

import { getOnboardingStatus } from '@/actions/onboarding'
import { ensureOnboardingComplete, ensureSubscriptionOrAccess } from '@/lib/guards'
import { requestAccessLevel } from '@/lib/actions/entitlement'
import { getServerSession } from 'next-auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

jest.mock('@/lib/actions/entitlement', () => ({ requestAccessLevel: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('next/headers', () => ({ headers: jest.fn() }))
jest.mock('next/navigation', () => ({ redirect: jest.fn() }))

// The guards module also pulls in these actions; stub them so importing
// `@/lib/guards` does not drag in their real dependencies.
jest.mock('@/actions/onboarding', () => ({ getOnboardingStatus: jest.fn() }))
jest.mock('@/actions/setup', () => ({ getSetupStatus: jest.fn() }))

const mockGetServerSession = jest.mocked(getServerSession)
const mockLevel = jest.mocked(requestAccessLevel)
const mockRedirect = jest.mocked(redirect)

function onPath(pathname: string | null) {
  jest.mocked(headers).mockResolvedValue(new Headers(pathname === null ? {} : { 'x-pm-pathname': pathname }) as never)
}

describe('ensureSubscriptionOrAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1', isAdmin: false } } as never)
  })

  it('is a no-op when there is no session', async () => {
    mockGetServerSession.mockResolvedValue(null)

    await ensureSubscriptionOrAccess()

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(mockLevel).not.toHaveBeenCalled()
  })

  it('lets a full member open any page', async () => {
    mockLevel.mockResolvedValue('full')
    onPath('/')

    await ensureSubscriptionOrAccess()

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(mockLevel).toHaveBeenCalledWith('user-1')
  })

  it.each(['/rewind/2026', '/rewind', '/rewind/2025'])('lets a lapsed member open %s', async (path) => {
    mockLevel.mockResolvedValue('lapsed')
    onPath(path)

    await ensureSubscriptionOrAccess()

    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it.each(['/', '/discord/link', '/announcements'])('redirects a lapsed member from %s', async (path) => {
    mockLevel.mockResolvedValue('lapsed')
    onPath(path)

    await ensureSubscriptionOrAccess()

    expect(mockRedirect).toHaveBeenCalledWith('/subscribe')
  })

  it.each(['/', '/rewind', '/rewind/2026'])('redirects a member with no access from %s', async (path) => {
    mockLevel.mockResolvedValue('none')
    onPath(path)

    await ensureSubscriptionOrAccess()

    expect(mockRedirect).toHaveBeenCalledWith('/subscribe')
  })

  it('treats a request without the header as the home page', async () => {
    mockLevel.mockResolvedValue('lapsed')
    onPath(null)

    await ensureSubscriptionOrAccess()

    expect(mockRedirect).toHaveBeenCalledWith('/subscribe')
  })
})

describe('ensureOnboardingComplete', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sends a member who has not finished onboarding to /onboarding', async () => {
    jest.mocked(getOnboardingStatus).mockResolvedValue({ success: true, data: { isComplete: false } } as never)

    await ensureOnboardingComplete()

    expect(mockRedirect).toHaveBeenCalledWith('/onboarding')
  })

  it('lets a member who has finished through', async () => {
    jest.mocked(getOnboardingStatus).mockResolvedValue({ success: true, data: { isComplete: true } } as never)

    await ensureOnboardingComplete()

    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('fails open when the status read fails', async () => {
    jest.mocked(getOnboardingStatus).mockResolvedValue({ success: false, code: 'INTERNAL', error: 'x' } as never)

    await ensureOnboardingComplete()

    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
