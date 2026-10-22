/**
 * The plan cards on /subscribe (P10.28, UI-37, UI-10): names and prices,
 * benefits, exactly one primary, no `price_` in visible text, and checkout
 * failures inline as well as in the toast.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { startCheckout } from '@/actions/subscription'
import { PlanCard } from '@/components/subscribe/plan-card'
import { PlanList } from '@/components/subscribe/plan-list'
import type { OfferedPrice } from '@/lib/stripe/prices'
import { redirectTo } from '@/lib/utils/navigation'

jest.mock('@/actions/subscription', () => ({ startCheckout: jest.fn() }))
// jsdom locks window.location, so the redirect goes through a mockable seam.
jest.mock('@/lib/utils/navigation', () => ({ redirectTo: jest.fn() }))

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh, push: jest.fn() }) }))

const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showToast: jest.fn(), showSuccess: jest.fn(), showError: mockShowError, showInfo: jest.fn() }),
}))

const mockStartCheckout = jest.mocked(startCheckout)

function plan(overrides: Partial<OfferedPrice> = {}): OfferedPrice {
  return {
    priceId: 'price_1QxSupporter',
    amount: 500,
    currency: 'usd',
    interval: 'month',
    productName: 'Supporter',
    features: [],
    recommended: false,
    ...overrides,
  }
}

const month = plan({ priceId: 'price_month', features: ['Every library', '4K streams', 'Rewind each December'] })
const year = plan({ priceId: 'price_year', amount: 5000, interval: 'year', productName: 'Supporter yearly' })

function renderCard(overrides: Partial<OfferedPrice> = {}, props: Partial<Parameters<typeof PlanCard>[0]> = {}) {
  return render(
    <PlanCard
      plan={plan(overrides)}
      primary
      pending={false}
      disabled={false}
      error={null}
      settings={{ locale: 'en-US' }}
      onSubscribe={jest.fn()}
      {...props}
    />
  )
}

beforeEach(() => jest.clearAllMocks())

describe('PlanCard', () => {
  it('shows the name, the price in tabular figures and the interval', () => {
    renderCard()
    expect(screen.getByRole('heading', { level: 2, name: 'Supporter' })).toBeInTheDocument()
    const price = screen.getByTestId('subscribe-plan-price-price_1QxSupporter')
    expect(price).toHaveTextContent('$5.00')
    expect(price).toHaveClass('tabular-nums', 'text-h1')
    expect(screen.getByText('per month')).toBeInTheDocument()
  })

  it('lists the benefits', () => {
    renderCard({ features: ['Every library', '4K streams'] })
    const list = screen.getByTestId('subscribe-plan-features-price_1QxSupporter')
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Every library', '4K streams'])
  })

  it('never shows a price or product id as text', () => {
    const { container } = renderCard({ productName: 'prod_ABC123', amount: null })
    expect(container.textContent).not.toContain('price_')
    expect(container.textContent).not.toContain('prod_')
    expect(screen.getByRole('heading', { level: 2, name: 'Membership' })).toBeInTheDocument()
    expect(screen.getByText('Custom pricing')).toBeInTheDocument()
  })

  it('formats another currency with its own symbol', () => {
    renderCard({ currency: 'eur', amount: 450 })
    expect(screen.getByTestId('subscribe-plan-price-price_1QxSupporter')).toHaveTextContent('€4.50')
  })

  it('renders an error inline', () => {
    renderCard({}, { error: 'Invalid plan selected.' })
    expect(screen.getByTestId('subscribe-plan-error-price_1QxSupporter')).toHaveTextContent('Invalid plan selected.')
  })
})

describe('PlanList', () => {
  const primaries = () => screen.getAllByTestId(/^subscribe-button-/).filter((b) => b.dataset.variant === 'primary')

  it('makes exactly one plan primary: the first when none is recommended', () => {
    const { container } = render(<PlanList plans={[month, year]} />)
    expect(primaries()).toHaveLength(1)
    expect(primaries()[0]).toHaveAttribute('data-testid', 'subscribe-button-price_month')
    expect(container.textContent).not.toContain('price_')
  })

  it('makes the recommended plan primary', () => {
    render(<PlanList plans={[month, { ...year, recommended: true }]} />)
    expect(primaries()).toHaveLength(1)
    expect(primaries()[0]).toHaveAttribute('data-testid', 'subscribe-button-price_year')
  })

  it('starts checkout and redirects to Stripe', async () => {
    const user = userEvent.setup()
    mockStartCheckout.mockResolvedValue({ success: true, data: { url: 'https://checkout.stripe.com/c/1' } })
    render(<PlanList plans={[month, year]} />)

    await user.click(screen.getByTestId('subscribe-button-price_year'))

    expect(mockStartCheckout).toHaveBeenCalledWith({ priceId: 'price_year' })
    await waitFor(() => expect(redirectTo).toHaveBeenCalledWith('https://checkout.stripe.com/c/1'))
    expect(screen.getByTestId('subscribe-button-price_year')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByTestId('subscribe-button-price_month')).toBeDisabled()
  })

  it('shows a failure in the toast and inline in its card', async () => {
    const user = userEvent.setup()
    mockStartCheckout.mockResolvedValue({ success: false, code: 'VALIDATION', error: 'Invalid plan selected.' })
    render(<PlanList plans={[month, year]} />)

    await user.click(screen.getByTestId('subscribe-button-price_month'))

    expect(await screen.findByTestId('subscribe-plan-error-price_month')).toHaveTextContent('Invalid plan selected.')
    expect(mockShowError).toHaveBeenCalledWith('Invalid plan selected.')
    expect(screen.queryByTestId('subscribe-plan-error-price_year')).not.toBeInTheDocument()
    expect(redirectTo).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('refreshes into the entitled screen on ALREADY_SUBSCRIBED', async () => {
    const user = userEvent.setup()
    mockStartCheckout.mockResolvedValue({ success: false, code: 'ALREADY_SUBSCRIBED', error: 'You already have a subscription.' })
    render(<PlanList plans={[month]} />)

    await user.click(screen.getByTestId('subscribe-button-price_month'))

    expect(await screen.findByTestId('subscribe-plan-error-price_month')).toBeInTheDocument()
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('shows the fallback copy when the action throws', async () => {
    const user = userEvent.setup()
    mockStartCheckout.mockRejectedValue(new Error('network'))
    render(<PlanList plans={[month]} />)

    await user.click(screen.getByTestId('subscribe-button-price_month'))

    expect(await screen.findByTestId('subscribe-plan-error-price_month')).toHaveTextContent(
      'Could not start checkout. Please try again.'
    )
  })
})
