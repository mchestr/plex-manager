import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { makeAdminUserWithStats } from '@/__tests__/utils/test-builders'
import { adminCancelSubscription, adminToggleExempt } from '@/actions/admin/subscriptions'
import { CancelSubscriptionDialog, GrantAccessDialog, ToggleExemptDialog } from '@/components/admin/users/actions/billing-dialogs'
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

describe('billing dialogs name the member\'s services (P11.11)', () => {
  const withServices = (services: Array<'plex' | 'jellyfin'>) =>
    listUserTarget(makeAdminUserWithStats({ id: 'u1', name: 'Morgan Lee', services }))

  it.each([
    [['jellyfin'], 'They get access to Jellyfin and become exempt from the subscription.'],
    [['plex', 'jellyfin'], 'They get access to Plex and Jellyfin and become exempt from the subscription.'],
    [[], 'They have no linked Plex or Jellyfin account'],
  ] as const)('the grant for %j', async (services, copy) => {
    const user = userEvent.setup()
    render(<GrantAccessDialog user={withServices([...services])} trigger={<Button data-testid="grant-access-button">Grant</Button>} />)

    await user.click(screen.getByTestId('grant-access-button'))
    expect(await screen.findByTestId('admin-user-grant-dialog')).toHaveTextContent(copy)
  })

  it('the cancel dialog says which access stops at period end', async () => {
    const user = userEvent.setup()
    render(<CancelSubscriptionDialog user={withServices(['jellyfin'])} trigger={<Button data-testid="cancel-subscription-button">Cancel</Button>} />)

    await user.click(screen.getByTestId('cancel-subscription-button'))
    expect(await screen.findByTestId('admin-user-cancel-dialog')).toHaveTextContent('They keep access until the paid period ends, then their Jellyfin access stops.')
  })
})
