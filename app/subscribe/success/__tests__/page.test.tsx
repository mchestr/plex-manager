/**
 * `/subscribe/success` (P10.28, UI-40): the anonymous redirect, "You're in",
 * and the live checklist, polled every 3 s until it settles or 2 minutes pass.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { getServerSession } from 'next-auth'
import type { ReactNode } from 'react'

import { getSubscriptionProvisioning, type SubscriptionProvisioning } from '@/actions/subscription'
import SubscribeSuccessPage from '@/app/subscribe/success/page'
import { ProvisioningChecklist } from '@/components/subscribe/provisioning-checklist'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/brand', () => ({ serverName: jest.fn().mockResolvedValue('Northfield Plex') }))
jest.mock('@/actions/subscription', () => ({ getSubscriptionProvisioning: jest.fn() }))
jest.mock('next-auth/react', () => ({ signOut: jest.fn() }))
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))

const mockProvisioning = jest.mocked(getSubscriptionProvisioning)

const WAITING: SubscriptionProvisioning = {
  status: null,
  plexInviteStatus: null,
  libraryCount: 4,
  memberSince: null,
  currentPeriodEnd: null,
}
const PAID: SubscriptionProvisioning = {
  ...WAITING,
  status: 'ACTIVE',
  memberSince: new Date('2027-01-26T18:00:00Z'),
  currentPeriodEnd: new Date('2027-02-26T18:00:00Z'),
}

function withQuery(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-1', name: 'Mira' } })
})

describe('/subscribe/success', () => {
  it('sends an anonymous visitor to /', async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)
    await expect(SubscribeSuccessPage()).rejects.toThrow('NEXT_REDIRECT /')
    expect(mockProvisioning).not.toHaveBeenCalled()
  })

  it("says You're in, seeds the checklist from the server, and links home", async () => {
    mockProvisioning.mockResolvedValue({ success: true, data: { ...PAID, plexInviteStatus: 'accepted' } })
    render(withQuery(await SubscribeSuccessPage()))

    expect(screen.getByRole('heading', { level: 1, name: "You're in" })).toBeInTheDocument()
    expect(screen.queryByText('Thanks for subscribing!')).not.toBeInTheDocument()
    expect(screen.getByTestId('subscribe-success-page')).toBeInTheDocument()
    expect(screen.getByTestId('subscribe-success-payment')).toHaveTextContent('Payment confirmed')
    expect(screen.getByTestId('subscribe-success-accepted')).toHaveTextContent('Sharing 4 libraries with your Plex account')
    expect(screen.getByTestId('subscribe-success-home-link')).toHaveAttribute('href', '/')
  })

  it('starts the checklist empty when the read fails', async () => {
    mockProvisioning.mockResolvedValue({ success: false, code: 'INTERNAL', error: 'Could not check your subscription.' })
    render(withQuery(await SubscribeSuccessPage()))

    expect(screen.getByTestId('subscribe-success-payment')).toHaveTextContent('Confirming your payment')
    expect(screen.getByTestId('subscribe-success-provisioning')).toBeInTheDocument()
  })
})

describe('ProvisioningChecklist', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  // The extra 50 ms lets TanStack Query's batched notify render the fetched data.
  const tick = (ms: number) => act(async () => {
    await jest.advanceTimersByTimeAsync(ms + 50)
  })

  it('updates as the provisioning moves on, then stops polling once settled', async () => {
    mockProvisioning
      .mockResolvedValueOnce({ success: true, data: PAID })
      .mockResolvedValue({ success: true, data: { ...PAID, plexInviteStatus: 'accepted' } })
    render(withQuery(<ProvisioningChecklist initial={WAITING} />))

    expect(screen.getByTestId('subscribe-success-payment')).toHaveTextContent('Confirming your payment')
    expect(screen.getByTestId('subscribe-success-provisioning')).toBeInTheDocument()

    await tick(3_000)
    expect(screen.getByTestId('subscribe-success-payment')).toHaveTextContent('Payment confirmed')
    expect(screen.getByTestId('subscribe-success-provisioning')).toBeInTheDocument()
    expect(screen.getByTestId('subscribe-success-dates')).toHaveTextContent('Member sinceJanuary 2027')
    expect(screen.getByTestId('subscribe-success-dates')).toHaveTextContent('RenewsFebruary 26, 2027')

    await tick(3_000)
    expect(screen.getByTestId('subscribe-success-accepted')).toBeInTheDocument()
    const calls = mockProvisioning.mock.calls.length

    await tick(30_000)
    expect(mockProvisioning).toHaveBeenCalledTimes(calls)
  })

  it('asks the member to accept the invite by email when auto-accept could not run', async () => {
    render(withQuery(<ProvisioningChecklist initial={{ ...PAID, plexInviteStatus: 'pending', libraryCount: null }} />))

    expect(screen.getByTestId('subscribe-success-pending')).toHaveTextContent('Check your email to accept the invite')
    await tick(30_000)
    expect(mockProvisioning).not.toHaveBeenCalled()
  })

  it('stops polling at 2 minutes', async () => {
    mockProvisioning.mockResolvedValue({ success: true, data: WAITING })
    render(withQuery(<ProvisioningChecklist initial={WAITING} />))

    await tick(120_000)
    const calls = mockProvisioning.mock.calls.length
    expect(calls).toBeGreaterThanOrEqual(39)
    expect(screen.getByTestId('subscribe-success-slow')).toBeInTheDocument()

    await tick(60_000)
    expect(mockProvisioning).toHaveBeenCalledTimes(calls)
  })
})
