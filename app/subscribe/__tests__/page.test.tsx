/**
 * `/subscribe` (P10.28, UI-37): `full` access gets "You already have access",
 * `none` the plans under "Join {serverName}", `lapsed` the plans with the
 * Rewind note, and no offered prices the unavailable screen.
 */

import { render, screen } from '@testing-library/react'
import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import SubscribePage from '@/app/subscribe/page'
import { getAccessLevel } from '@/lib/access'
import { getOfferedPrices, type OfferedPrice } from '@/lib/stripe/prices'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/access', () => ({ getAccessLevel: jest.fn() }))
jest.mock('@/lib/stripe/prices', () => ({ getOfferedPrices: jest.fn() }))
jest.mock('@/lib/brand', () => ({ serverName: jest.fn().mockResolvedValue('Northfield Plex') }))
jest.mock('@/actions/subscription', () => ({ startCheckout: jest.fn() }))
jest.mock('next-auth/react', () => ({ signOut: jest.fn() }))
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showToast: jest.fn(), showSuccess: jest.fn(), showError: jest.fn(), showInfo: jest.fn() }),
}))
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))

type Subscription = Awaited<ReturnType<typeof prismaMock.subscription.findUnique>>
type Discord = Awaited<ReturnType<typeof prismaMock.discordIntegration.findUnique>>

const SUPPORTER: OfferedPrice = {
  priceId: 'price_1QxSupporter',
  amount: 500,
  currency: 'usd',
  interval: 'month',
  productName: 'Supporter',
  features: ['Every library'],
  recommended: false,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-1', name: 'Mira' } })
  jest.mocked(getOfferedPrices).mockResolvedValue([SUPPORTER])
})

async function renderPage() {
  return render(await SubscribePage())
}

describe('/subscribe', () => {
  it('sends an anonymous visitor to sign-in', async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)
    await expect(SubscribePage()).rejects.toThrow('NEXT_REDIRECT /')
  })

  it('gives full access the entitled screen with Manage billing to /membership', async () => {
    jest.mocked(getAccessLevel).mockResolvedValue('full')
    prismaMock.subscription.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_1' } as Subscription)
    await renderPage()

    expect(screen.getByTestId('subscribe-already-entitled')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'You already have access' })).toBeInTheDocument()
    expect(screen.getByTestId('subscribe-manage-billing')).toHaveAttribute('href', '/membership')
    expect(screen.getByTestId('subscribe-home-link')).toHaveAttribute('href', '/')
    expect(screen.queryByTestId('subscribe-plan-list')).not.toBeInTheDocument()
    expect(screen.getByTestId('public-shell-sign-out')).toBeInTheDocument()
  })

  it('leaves Manage billing out when there is no Stripe customer', async () => {
    jest.mocked(getAccessLevel).mockResolvedValue('full')
    prismaMock.subscription.findUnique.mockResolvedValue(null)
    await renderPage()

    expect(screen.queryByTestId('subscribe-manage-billing')).not.toBeInTheDocument()
    expect(screen.getByTestId('subscribe-home-link')).toHaveTextContent('Go to home')
  })

  it('gives no access the plans under Join {serverName}', async () => {
    jest.mocked(getAccessLevel).mockResolvedValue('none')
    const { container } = await renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Join Northfield Plex' })).toBeInTheDocument()
    expect(screen.getByText("You're signed in as Mira, but you aren't on the server yet.")).toBeInTheDocument()
    expect(screen.getByTestId('subscribe-plan-list')).toBeInTheDocument()
    expect(screen.queryByTestId('subscribe-lapsed-note')).not.toBeInTheDocument()
    expect(screen.getByTestId('public-shell-sign-out')).toBeInTheDocument()
    expect(container.textContent).not.toContain('price_')
  })

  it('gives lapsed access the plans with the Rewind note', async () => {
    jest.mocked(getAccessLevel).mockResolvedValue('lapsed')
    await renderPage()

    expect(screen.getByTestId('subscribe-plan-list')).toBeInTheDocument()
    expect(screen.getByTestId('subscribe-lapsed-note')).toHaveTextContent('You can still read your finished Rewinds')
  })

  it('shows the unavailable screen with Sign out when no prices are offered', async () => {
    jest.mocked(getAccessLevel).mockResolvedValue('none')
    jest.mocked(getOfferedPrices).mockResolvedValue([])
    prismaMock.discordIntegration.findUnique.mockResolvedValue(null)
    await renderPage()

    expect(screen.getByTestId('subscribe-unavailable')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: "Subscriptions aren't open right now" })).toBeInTheDocument()
    expect(screen.getByTestId('subscribe-sign-out')).toBeInTheDocument()
    expect(screen.queryByTestId('subscribe-discord-link')).not.toBeInTheDocument()
    expect(screen.queryByText('Return home')).not.toBeInTheDocument()
  })

  it("links the owner's Discord on the unavailable screen when an invite code exists", async () => {
    jest.mocked(getAccessLevel).mockResolvedValue('none')
    jest.mocked(getOfferedPrices).mockResolvedValue([])
    prismaMock.discordIntegration.findUnique.mockResolvedValue({ serverInviteCode: 'northfield' } as Discord)
    await renderPage()

    expect(screen.getByTestId('subscribe-discord-link')).toHaveAttribute('href', 'https://discord.gg/northfield')
  })
})
