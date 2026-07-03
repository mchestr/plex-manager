import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StripeSettingsForm } from '@/components/admin/settings/StripeSettingsForm'
import * as configActions from '@/actions/admin/admin-config'
import { useRouter } from 'next/navigation'
import { ToastProvider } from '@/components/ui/toast'

jest.mock('@/actions/admin/admin-config', () => ({
  updateStripeSettings: jest.fn(),
  setStripeEnabled: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()

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

const mockRefresh = jest.fn()

const renderForm = (props?: Partial<React.ComponentProps<typeof StripeSettingsForm>>) => {
  return render(
    <ToastProvider>
      <StripeSettingsForm
        enabled={false}
        hasSecretKey={false}
        hasWebhookSecret={false}
        priceIds={[]}
        {...props}
      />
    </ToastProvider>
  )
}

describe('StripeSettingsForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({ refresh: mockRefresh })
  })

  it('renders secret/webhook/price inputs and the master toggle', () => {
    renderForm()

    expect(screen.getByTestId('stripe-secret-key-input')).toBeInTheDocument()
    expect(screen.getByTestId('stripe-webhook-secret-input')).toBeInTheDocument()
    expect(screen.getByTestId('stripe-price-ids-input')).toBeInTheDocument()
    expect(screen.getByTestId('stripe-enabled-toggle')).toBeInTheDocument()
  })

  it('does not render raw secret values in the inputs', () => {
    renderForm({ hasSecretKey: true, hasWebhookSecret: true, priceIds: ['price_1'] })

    const secretInput = screen.getByTestId('stripe-secret-key-input') as HTMLInputElement
    const webhookInput = screen.getByTestId('stripe-webhook-secret-input') as HTMLInputElement

    // Secrets are never sent to the client — the fields start blank.
    expect(secretInput.value).toBe('')
    expect(webhookInput.value).toBe('')
    // Prefilled price ids (non-secret) are fine to display.
    expect((screen.getByTestId('stripe-price-ids-input') as HTMLInputElement).value).toContain('price_1')
  })

  it('disables the enable toggle and shows requirements when config is incomplete', () => {
    renderForm({ enabled: false, hasSecretKey: false, hasWebhookSecret: false, priceIds: [] })

    expect(screen.getByTestId('stripe-enabled-toggle')).toBeDisabled()
    const requirements = screen.getByTestId('stripe-enable-requirements')
    expect(requirements).toHaveTextContent('secret key')
    expect(requirements).toHaveTextContent('webhook secret')
    expect(requirements).toHaveTextContent('at least one price ID')
  })

  it('enables the toggle when config is fully present', () => {
    renderForm({ enabled: false, hasSecretKey: true, hasWebhookSecret: true, priceIds: ['price_1'] })

    expect(screen.getByTestId('stripe-enabled-toggle')).not.toBeDisabled()
    expect(screen.queryByTestId('stripe-enable-requirements')).not.toBeInTheDocument()
  })

  it('saves settings via updateStripeSettings and shows a success toast', async () => {
    const user = userEvent.setup()
    ;(configActions.updateStripeSettings as jest.Mock).mockResolvedValue({ success: true })

    renderForm()

    await user.type(screen.getByTestId('stripe-secret-key-input'), 'sk_test_123')
    await user.type(screen.getByTestId('stripe-webhook-secret-input'), 'whsec_123')
    await user.type(screen.getByTestId('stripe-price-ids-input'), 'price_1, price_2')
    await user.click(screen.getByTestId('stripe-save-button'))

    await waitFor(() => {
      expect(configActions.updateStripeSettings).toHaveBeenCalledWith({
        secretKey: 'sk_test_123',
        webhookSecret: 'whsec_123',
        priceIds: ['price_1', 'price_2'],
      })
    })
    expect(mockShowSuccess).toHaveBeenCalledWith('Stripe settings saved successfully')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('omits blank secrets on save (leave-blank-to-keep)', async () => {
    const user = userEvent.setup()
    ;(configActions.updateStripeSettings as jest.Mock).mockResolvedValue({ success: true })

    renderForm({ hasSecretKey: true, hasWebhookSecret: true, priceIds: ['price_1'] })

    await user.click(screen.getByTestId('stripe-save-button'))

    await waitFor(() => {
      expect(configActions.updateStripeSettings).toHaveBeenCalledWith({
        secretKey: undefined,
        webhookSecret: undefined,
        priceIds: ['price_1'],
      })
    })
  })

  it('surfaces save errors via error toast', async () => {
    const user = userEvent.setup()
    ;(configActions.updateStripeSettings as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to save',
    })

    renderForm({ priceIds: ['price_1'], hasSecretKey: true, hasWebhookSecret: true })

    await user.click(screen.getByTestId('stripe-save-button'))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Failed to save')
    })
  })

  it('enables Stripe via the toggle when config is complete', async () => {
    const user = userEvent.setup()
    ;(configActions.setStripeEnabled as jest.Mock).mockResolvedValue({ success: true })

    renderForm({ enabled: false, hasSecretKey: true, hasWebhookSecret: true, priceIds: ['price_1'] })

    await user.click(screen.getByTestId('stripe-enabled-toggle'))

    await waitFor(() => {
      expect(configActions.setStripeEnabled).toHaveBeenCalledWith(true)
    })
    expect(mockShowSuccess).toHaveBeenCalledWith('Stripe enabled successfully')
  })

  it('disables Stripe via the toggle', async () => {
    const user = userEvent.setup()
    ;(configActions.setStripeEnabled as jest.Mock).mockResolvedValue({ success: true })

    renderForm({ enabled: true, hasSecretKey: true, hasWebhookSecret: true, priceIds: ['price_1'] })

    await user.click(screen.getByTestId('stripe-enabled-toggle'))

    await waitFor(() => {
      expect(configActions.setStripeEnabled).toHaveBeenCalledWith(false)
    })
    expect(mockShowSuccess).toHaveBeenCalledWith('Stripe disabled successfully')
  })

  it('surfaces toggle errors via error toast', async () => {
    const user = userEvent.setup()
    ;(configActions.setStripeEnabled as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Cannot enable',
    })

    renderForm({ enabled: false, hasSecretKey: true, hasWebhookSecret: true, priceIds: ['price_1'] })

    await user.click(screen.getByTestId('stripe-enabled-toggle'))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Cannot enable')
    })
  })
})
