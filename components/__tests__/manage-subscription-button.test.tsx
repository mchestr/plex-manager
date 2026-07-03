import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ManageSubscriptionButton } from '@/components/subscription/manage-subscription-button'
import * as subscriptionActions from '@/actions/subscription'
import { redirectTo } from '@/lib/utils/navigation'
import { ToastProvider } from '@/components/ui/toast'

jest.mock('@/actions/subscription', () => ({
  openBillingPortal: jest.fn(),
}))

// Navigation is a thin, mockable seam — jsdom locks window.location, so we mock
// the helper module instead of the global to observe redirects.
jest.mock('@/lib/utils/navigation', () => ({
  redirectTo: jest.fn(),
}))

const mockShowError = jest.fn()

jest.mock('@/components/ui/toast', () => {
  const actual = jest.requireActual('@/components/ui/toast')
  return {
    ...actual,
    useToast: () => ({
      showToast: jest.fn(),
      showSuccess: jest.fn(),
      showError: mockShowError,
      showInfo: jest.fn(),
    }),
  }
})

const mockOpenBillingPortal = subscriptionActions.openBillingPortal as jest.Mock
const mockRedirectTo = redirectTo as jest.Mock

const renderButton = () =>
  render(
    <ToastProvider>
      <ManageSubscriptionButton />
    </ToastProvider>
  )

describe('ManageSubscriptionButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders a Manage subscription button', () => {
    renderButton()

    expect(screen.getByTestId('manage-subscription-button')).toHaveTextContent(
      'Manage subscription'
    )
  })

  it('opens the billing portal and redirects to the returned URL', async () => {
    const user = userEvent.setup()
    mockOpenBillingPortal.mockResolvedValue({
      url: 'https://billing.stripe.com/session/bps_1',
    })

    renderButton()

    await user.click(screen.getByTestId('manage-subscription-button'))

    await waitFor(() => {
      expect(mockOpenBillingPortal).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(mockRedirectTo).toHaveBeenCalledWith(
        'https://billing.stripe.com/session/bps_1'
      )
    })
  })

  it('shows a loading state while the portal session is being created', async () => {
    const user = userEvent.setup()
    let resolvePortal: (value: { url: string }) => void
    mockOpenBillingPortal.mockReturnValue(
      new Promise((resolve) => {
        resolvePortal = resolve
      })
    )

    renderButton()

    await user.click(screen.getByTestId('manage-subscription-button'))

    await waitFor(() => {
      expect(screen.getByTestId('manage-subscription-button')).toBeDisabled()
    })
    expect(screen.getByText('Opening...')).toBeInTheDocument()

    resolvePortal!({ url: 'https://billing.stripe.com/session/bps_1' })
  })

  it('surfaces an error toast and stays on the page when the action returns an error', async () => {
    const user = userEvent.setup()
    mockOpenBillingPortal.mockResolvedValue({
      error: 'No billing account found for your subscription.',
    })

    renderButton()

    await user.click(screen.getByTestId('manage-subscription-button'))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(
        'No billing account found for your subscription.'
      )
    })
    expect(mockRedirectTo).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByTestId('manage-subscription-button')).not.toBeDisabled()
    })
  })

  it('surfaces an error toast when the action throws', async () => {
    const user = userEvent.setup()
    mockOpenBillingPortal.mockRejectedValue(new Error('network'))

    renderButton()

    await user.click(screen.getByTestId('manage-subscription-button'))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(
        'Could not open the billing portal. Please try again.'
      )
    })
    expect(mockRedirectTo).not.toHaveBeenCalled()
  })
})
