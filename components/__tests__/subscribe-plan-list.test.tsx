import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PlanList } from '@/components/subscribe/plan-list'
import * as subscriptionActions from '@/actions/subscription'
import { redirectTo } from '@/lib/utils/navigation'
import type { OfferedPrice } from '@/lib/stripe/prices'
import { ToastProvider } from '@/components/ui/toast'

jest.mock('@/actions/subscription', () => ({
  startCheckout: jest.fn(),
}))

// Navigation is a thin, mockable seam — jsdom locks window.location, so we mock
// the helper module instead of the global to observe redirects.
jest.mock('@/lib/utils/navigation', () => ({
  redirectTo: jest.fn(),
}))

const mockShowError = jest.fn()
const mockShowSuccess = jest.fn()

jest.mock('@/components/ui/toast', () => {
  const actual = jest.requireActual('@/components/ui/toast')
  return {
    ...actual,
    useToast: () => ({
      showToast: jest.fn(),
      showSuccess: mockShowSuccess,
      showError: mockShowError,
      showInfo: jest.fn(),
    }),
  }
})

const mockStartCheckout = subscriptionActions.startCheckout as jest.Mock

const monthPlan: OfferedPrice = {
  priceId: 'price_month',
  amount: 500,
  currency: 'usd',
  interval: 'month',
  productName: 'Plex Access',
}

const yearPlan: OfferedPrice = {
  priceId: 'price_year',
  amount: 5000,
  currency: 'usd',
  interval: 'year',
  productName: 'Plex Access Annual',
}

const mockRedirectTo = redirectTo as jest.Mock

const renderList = (plans: OfferedPrice[]) =>
  render(
    <ToastProvider>
      <PlanList plans={plans} />
    </ToastProvider>
  )

describe('PlanList', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders each offered plan with price details and a Subscribe button', () => {
    renderList([monthPlan, yearPlan])

    expect(screen.getByText('Plex Access')).toBeInTheDocument()
    expect(screen.getByText('Plex Access Annual')).toBeInTheDocument()
    expect(screen.getByTestId('subscribe-plan-price-price_month')).toHaveTextContent('$5.00')
    expect(screen.getByTestId('subscribe-plan-price-price_year')).toHaveTextContent('$50.00')
    expect(screen.getByText('/ month')).toBeInTheDocument()
    expect(screen.getByText('/ year')).toBeInTheDocument()
    expect(screen.getByTestId('subscribe-button-price_month')).toBeInTheDocument()
    expect(screen.getByTestId('subscribe-button-price_year')).toBeInTheDocument()
  })

  it('starts checkout and redirects to the returned URL when Subscribe is clicked', async () => {
    const user = userEvent.setup()
    mockStartCheckout.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_1' })

    renderList([monthPlan])

    await user.click(screen.getByTestId('subscribe-button-price_month'))

    await waitFor(() => {
      expect(mockStartCheckout).toHaveBeenCalledWith('price_month')
    })
    await waitFor(() => {
      expect(mockRedirectTo).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_1')
    })
  })

  it('shows a loading state on the clicked plan while checkout is starting', async () => {
    const user = userEvent.setup()
    let resolveCheckout: (value: { url: string }) => void
    mockStartCheckout.mockReturnValue(
      new Promise((resolve) => {
        resolveCheckout = resolve
      })
    )

    renderList([monthPlan])

    await user.click(screen.getByTestId('subscribe-button-price_month'))

    await waitFor(() => {
      expect(screen.getByTestId('subscribe-button-price_month')).toBeDisabled()
    })
    expect(screen.getByText('Redirecting...')).toBeInTheDocument()

    resolveCheckout!({ url: 'https://checkout.stripe.com/c/pay/cs_1' })
  })

  it('surfaces an error toast and stays on the page when checkout returns an error', async () => {
    const user = userEvent.setup()
    mockStartCheckout.mockResolvedValue({ error: 'Subscriptions are not available right now.' })

    renderList([monthPlan])

    await user.click(screen.getByTestId('subscribe-button-price_month'))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Subscriptions are not available right now.')
    })
    expect(mockRedirectTo).not.toHaveBeenCalled()
    // Button becomes clickable again after the error.
    await waitFor(() => {
      expect(screen.getByTestId('subscribe-button-price_month')).not.toBeDisabled()
    })
  })

  it('surfaces an error toast when the action throws', async () => {
    const user = userEvent.setup()
    mockStartCheckout.mockRejectedValue(new Error('network'))

    renderList([monthPlan])

    await user.click(screen.getByTestId('subscribe-button-price_month'))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Could not start checkout. Please try again.')
    })
    expect(mockRedirectTo).not.toHaveBeenCalled()
  })

  it('formats a custom-priced plan without crashing', () => {
    renderList([{ ...monthPlan, amount: null, interval: null }])

    expect(screen.getByTestId('subscribe-plan-price-price_month')).toHaveTextContent('Custom')
  })
})
