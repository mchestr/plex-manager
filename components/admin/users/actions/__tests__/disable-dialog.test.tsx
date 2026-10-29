import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { makeAdminUserWithStats } from '@/__tests__/utils/test-builders'
import { setUserDisabled } from '@/actions/admin/admin-users'
import { DisableDialog } from '@/components/admin/users/actions/access-dialogs'
import { Button } from '@/components/ui/button'
import { listUserTarget } from '@/lib/admin/user-actions'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)
jest.mock('@/actions/admin/admin-users', () => ({ setUserDisabled: jest.fn(), setUserRole: jest.fn(), updateUserAdminStatus: jest.fn() }))
jest.mock('@/actions/user-queries', () => ({ unshareUserLibrary: jest.fn() }))
jest.mock('@/actions/rewind-generation', () => ({ adminRegenerateRewind: jest.fn() }))
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

const target = (overrides: Parameters<typeof makeAdminUserWithStats>[0] = {}) =>
  listUserTarget(makeAdminUserWithStats({ id: 'u1', name: 'Morgan Lee', invitedBy: { id: 'sam', name: 'Sam' }, ...overrides }))

const open = async (user: ReturnType<typeof listUserTarget>) => {
  const events = userEvent.setup()
  render(<DisableDialog user={user} trigger={<Button data-testid="disable-open">Disable</Button>} />)
  await events.click(screen.getByTestId('disable-open'))
  await screen.findByTestId('admin-user-disable-dialog')
  return events
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(setUserDisabled).mockResolvedValue({ success: true, data: null })
})

describe('DisableDialog for a member an affiliate invited', () => {
  it('shows who invited them, and disables without a revoke by default', async () => {
    const user = await open(target())
    expect(screen.getByTestId('admin-user-disable-revoke-inviter-fields')).toHaveTextContent('Invited by Sam')
    expect(screen.queryByTestId('admin-user-disable-revoke-inviter-reason')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('admin-user-disable-confirm'))
    expect(setUserDisabled).toHaveBeenCalledWith({ userId: 'u1', disabled: true, revokeInviter: undefined })
  })

  it("also revokes Sam's status, with the reason, when checked", async () => {
    const user = await open(target())
    await user.click(screen.getByTestId('admin-user-disable-revoke-inviter'))
    await user.type(screen.getByTestId('admin-user-disable-revoke-inviter-reason'), 'Invited a reseller')
    await user.click(screen.getByTestId('admin-user-disable-confirm'))

    expect(setUserDisabled).toHaveBeenCalledWith({ userId: 'u1', disabled: true, revokeInviter: { reason: 'Invited a reseller' } })
    await waitFor(() => expect(screen.queryByTestId('admin-user-disable-dialog')).not.toBeInTheDocument())
  })

  it('offers nothing when enabling', async () => {
    await open(target({ disabledAt: new Date() }))
    expect(screen.queryByTestId('admin-user-disable-revoke-inviter-fields')).not.toBeInTheDocument()
  })

  it('offers nothing for a member nobody invited', async () => {
    await open(target({ invitedBy: null }))
    expect(screen.queryByTestId('admin-user-disable-revoke-inviter-fields')).not.toBeInTheDocument()
  })
})
