/**
 * The /membership page (P10.22, UI-37): a 404 with Stripe off and no row,
 * the plan by name (never `price_`), the renewal line and Manage billing.
 */

import { render, screen } from '@testing-library/react'
import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'
import { notFound } from 'next/navigation'

import { buildConfig, buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import MembershipPage from '@/app/(app)/membership/page'
import { getPlanName, getPlanPrice } from '@/lib/stripe/prices'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
jest.mock('@/lib/settings/app-settings', () => ({
  getFormatSettings: jest.fn().mockResolvedValue({ timeZone: 'America/Chicago', locale: 'en-US' }),
}))
jest.mock('@/lib/stripe/prices', () => ({ getPlanName: jest.fn(), getPlanPrice: jest.fn() }))
jest.mock('@/actions/subscription', () => ({ openBillingPortal: jest.fn() }))
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showToast: jest.fn(), showSuccess: jest.fn(), showError: jest.fn(), showInfo: jest.fn() }),
}))

type Subscription = Awaited<ReturnType<typeof prismaMock.subscription.findUnique>>

const ROW = {
  status: 'ACTIVE',
  priceId: 'price_1QxSupporter',
  currentPeriodEnd: new Date('2026-11-06T18:00:00Z'),
  cancelAtPeriodEnd: false,
} as Subscription

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-1' } })
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1' }))
  jest.mocked(getPlanName).mockResolvedValue('Supporter plan')
  jest.mocked(getPlanPrice).mockResolvedValue({
    priceId: 'price_1QxSupporter',
    amount: 500,
    currency: 'usd',
    interval: 'month',
    productName: 'Supporter plan',
    features: [],
    recommended: false,
  })
})

describe('MembershipPage', () => {
  it('is a 404 with Stripe off and no subscription row', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled: false }))
    prismaMock.subscription.findUnique.mockResolvedValue(null)

    await expect(MembershipPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })

  it('shows the plan name, never the price id, with the renewal line and Manage billing', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled: true }))
    prismaMock.subscription.findUnique.mockResolvedValue(ROW)

    const { container } = render(await MembershipPage())

    expect(screen.getByRole('heading', { level: 1, name: 'Membership' })).toBeInTheDocument()
    expect(screen.getByTestId('subscription-plan')).toHaveTextContent('Supporter plan')
    expect(container.textContent).not.toContain('price_')
    expect(screen.getByTestId('subscription-status-badge')).toHaveTextContent('Active')
    expect(screen.getByTestId('subscription-period')).toHaveTextContent('Renews November 6, 2026')
    expect(screen.getByTestId('manage-subscription-button')).toHaveTextContent('Manage billing')
    expect(getPlanName).toHaveBeenCalledWith('price_1QxSupporter')
  })

  it('stays open for a past subscriber after Stripe is turned off', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled: false }))
    prismaMock.subscription.findUnique.mockResolvedValue({ ...ROW, status: 'CANCELED' } as Subscription)

    render(await MembershipPage())

    expect(screen.getByTestId('subscription-status-badge')).toHaveTextContent('Canceled')
  })

  it('shows Comp for a comped member without a subscription', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled: true }))
    prismaMock.subscription.findUnique.mockResolvedValue(null)
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ isExempt: true, exemptReason: 'comp' }))

    render(await MembershipPage())

    expect(screen.getByTestId('subscription-status-badge')).toHaveTextContent('Comp')
    expect(screen.queryByTestId('manage-subscription-button')).not.toBeInTheDocument()
  })
})
