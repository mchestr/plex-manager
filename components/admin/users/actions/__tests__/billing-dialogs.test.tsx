import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { makeAdminUserWithStats } from '@/__tests__/utils/test-builders'
import { adminCancelSubscription, adminToggleExempt } from '@/actions/admin/subscriptions'
import { CancelSubscriptionDialog, ToggleExemptDialog } from '@/components/admin/users/actions/billing-dialogs'
import { Button } from '@/components/ui/button'
import { listUserTarget } from '@/lib/admin/user-actions'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)
jest.mock('@/actions/admin/subscriptions', () => ({
  adminGrantAccess: jest.fn(),
  adminToggleExempt: jest.fn(),
  adminCancelSubscription: jest.fn(),
}))
const mockShowSuccess = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: jest.fn() }) }))

const target = (isExempt: boolean) => listUserTarget(makeAdminUserWithStats({ id: 'u1', name: 'Morgan Lee', isExempt }))

beforeEach(() => jest.clearAllMocks())

describe('billing dialogs with a trigger (the Billing tab)', () => {
  it('confirms removing an exemption as destructive and closes on success', async () => {
    jest.mocked(adminToggleExempt).mockResolvedValue({ success: true, data: null })
    const user = userEvent.setup()
    render(<ToggleExemptDialog user={target(true)} trigger={<Button data-testid="toggle-exempt-button">Remove exemption</Button>} />)

    await user.click(screen.getByTestId('toggle-exempt-button'))
    expect(await screen.findByTestId('admin-user-exempt-dialog')).toHaveTextContent("Remove Morgan Lee's exemption?")
    await user.click(screen.getByTestId('admin-user-exempt-confirm'))

    expect(adminToggleExempt).toHaveBeenCalledWith({ userId: 'u1' })
    expect(mockShowSuccess).toHaveBeenCalledWith('Exemption removed')
    await waitFor(() => expect(screen.queryByTestId('admin-user-exempt-dialog')).not.toBeInTheDocument())
  })

  it("keeps the subscription action's error inside the dialog", async () => {
    jest.mocked(adminCancelSubscription).mockResolvedValue({ success: false, code: 'UPSTREAM_UNAVAILABLE', error: 'Stripe is not configured' })
    const user = userEvent.setup()
    render(<CancelSubscriptionDialog user={target(false)} trigger={<Button data-testid="cancel-subscription-button">Cancel subscription</Button>} />)

    await user.click(screen.getByTestId('cancel-subscription-button'))
    await user.click(await screen.findByTestId('admin-user-cancel-confirm'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Stripe is not configured')
    expect(screen.getByTestId('admin-user-cancel-dialog')).toBeInTheDocument()
  })
})
