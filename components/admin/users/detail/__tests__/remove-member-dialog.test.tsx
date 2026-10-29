import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { previewMemberRemoval, removeMember } from '@/actions/admin/member-access'
import { RemoveMemberDialog } from '@/components/admin/users/detail/remove-member-dialog'
import type { EraseReport } from '@/lib/members/erase'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)
jest.mock('@/actions/admin/member-access', () => ({ previewMemberRemoval: jest.fn(), removeMember: jest.fn() }))

const PREVIEW = { dryRun: true, plan: { cancelStripe: false, services: ['plex'], discordLinked: false }, counts: {}, outcome: null } as unknown as EraseReport

function renderDialog(props: Partial<Parameters<typeof RemoveMemberDialog>[0]> = {}) {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <RemoveMemberDialog userId="u1" name="Morgan" invitedBy={{ id: 'sam', name: 'Sam' }} hasPlexId {...props} />
    </QueryClientProvider>
  )
}

async function openAndType() {
  const user = userEvent.setup()
  await user.click(screen.getByTestId('admin-remove-member-open'))
  await screen.findByTestId('admin-remove-member-preview')
  await user.type(screen.getByTestId('admin-remove-member-confirm-input'), 'Morgan')
  return user
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(previewMemberRemoval).mockResolvedValue({ success: true, data: PREVIEW })
  jest.mocked(removeMember).mockResolvedValue({ success: true, data: PREVIEW })
})

describe('RemoveMemberDialog affiliate options', () => {
  it('removes with both options off by default', async () => {
    renderDialog()
    const user = await openAndType()
    expect(screen.getByTestId('admin-remove-member-revoke-inviter-fields')).toHaveTextContent('Invited by Sam')
    await user.click(screen.getByTestId('admin-remove-member-button'))
    expect(removeMember).toHaveBeenCalledWith({ userId: 'u1', confirmName: 'Morgan', block: false, revokeInviter: undefined })
  })

  it('blocks the Plex account and revokes the inviter when checked', async () => {
    renderDialog()
    const user = await openAndType()
    await user.click(screen.getByTestId('admin-remove-member-block'))
    await user.click(screen.getByTestId('admin-remove-member-revoke-inviter'))
    await user.type(screen.getByTestId('admin-remove-member-revoke-inviter-reason'), 'Resold access')
    await user.click(screen.getByTestId('admin-remove-member-button'))
    expect(removeMember).toHaveBeenCalledWith({ userId: 'u1', confirmName: 'Morgan', block: true, revokeInviter: { reason: 'Resold access' } })
  })

  it('offers no block without a Plex id, and no revoke without an inviter', async () => {
    renderDialog({ hasPlexId: false, invitedBy: null })
    await openAndType()
    expect(screen.queryByTestId('admin-remove-member-block')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-remove-member-revoke-inviter-fields')).not.toBeInTheDocument()
  })
})
