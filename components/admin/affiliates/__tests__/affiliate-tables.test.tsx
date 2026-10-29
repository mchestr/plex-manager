import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { currentHref, resetUrl } from '@/__tests__/helpers/url-router'
import { AffiliateTabs } from '@/components/admin/affiliates/affiliate-tabs'
import { AffiliatesTable } from '@/components/admin/affiliates/affiliates-table'
import { ApplicationsTable } from '@/components/admin/affiliates/applications-table'
import { HistoryTab } from '@/components/admin/affiliates/history-tab'
import { InviteTree } from '@/components/admin/affiliates/invite-tree'
import type { AffiliateRow, ApplicationRow } from '@/lib/data/affiliates'
import { bindFormat } from '@/lib/utils/format'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)
jest.mock('@/actions/admin/affiliates', () => ({}))
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

const SAM = { id: 'sam', name: 'Sam', accessEndedAt: null }

const application: ApplicationRow = {
  id: 'app-1',
  member: SAM,
  watchHours: 123.4,
  watchHoursReadAt: new Date('2026-10-20T12:00:00Z'),
  memberSince: new Date('2025-01-01T12:00:00Z'),
  appliedAt: new Date('2026-10-21T12:00:00Z'),
  note: 'I share with family',
  flags: ['shared_email'],
}

const affiliate: AffiliateRow = {
  id: 'app-2',
  member: { ...SAM, accessEndedAt: new Date() },
  allowance: { invites: 0, source: 'override' },
  state: 'override_zero',
  flags: [],
  inviteOverride: 0,
  slotsUsed: 1,
  totalJoins: 4,
  expiredUnused: 2,
  openInvites: [{ id: 'inv-1', label: 'For Ana', expiresAt: new Date('2026-11-01T12:00:00Z'), codeEnd: 'WXYZ' }],
}

beforeEach(() => resetUrl('/admin/affiliates'))

describe('ApplicationsTable', () => {
  it('shows the stored hours, the note and the flags, with decisions for admins', () => {
    render(<ApplicationsTable rows={[application]} admin />)
    const row = screen.getByTestId('admin-affiliates-applications-row-app-1')
    expect(row).toHaveTextContent('123 h')
    expect(row).toHaveTextContent('I share with family')
    expect(within(row).getByTestId('admin-affiliates-application-flags-app-1-shared_email')).toHaveTextContent('Plex email on another account')
    expect(screen.getByTestId('admin-affiliates-approve-app-1')).toBeInTheDocument()
    expect(screen.getByTestId('admin-affiliates-member-sam')).toHaveAttribute('href', '/admin/users/sam')
  })

  it('gives Support no decisions and no member links', () => {
    render(<ApplicationsTable rows={[application]} admin={false} />)
    expect(screen.queryByTestId('admin-affiliates-approve-app-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-affiliates-refuse-app-1')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sam' })).not.toBeInTheDocument()
  })

  it('shows the empty state', () => {
    render(<ApplicationsTable rows={[]} admin />)
    expect(screen.getByTestId('admin-affiliates-applications-empty')).toHaveTextContent('No applications')
  })
})

describe('AffiliatesTable', () => {
  it('shows the allowance source, the slots used, the state and "No longer a member"', () => {
    render(<AffiliatesTable rows={[affiliate]} admin />)
    expect(screen.getByTestId('admin-affiliates-allowance-app-2')).toHaveTextContent('Set by an admin')
    expect(screen.getByTestId('admin-affiliates-used-app-2')).toHaveTextContent('1 of 0')
    expect(screen.getByTestId('admin-affiliates-state-app-2')).toHaveTextContent('Paused (0 invites)')
    expect(screen.getByTestId('admin-affiliates-affiliates-row-app-2')).toHaveTextContent('No longer a member')
  })

  it('opens the open invites with the last 4 characters of the code', async () => {
    const user = userEvent.setup()
    render(<AffiliatesTable rows={[affiliate]} admin />)
    await user.click(screen.getByTestId('admin-affiliates-invites-app-2'))
    const item = await screen.findByTestId('admin-affiliates-invites-app-2-row-inv-1')
    expect(item).toHaveTextContent('For Ana')
    expect(item).toHaveTextContent('WXYZ')
  })

  it('gives Support no management', () => {
    render(<AffiliatesTable rows={[{ ...affiliate, openInvites: null }]} admin={false} />)
    expect(screen.queryByTestId('admin-affiliates-revoke-app-2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-affiliates-invites-app-2')).not.toBeInTheDocument()
  })
})

describe('InviteTree', () => {
  const f = bindFormat({ timeZone: 'UTC', locale: 'en-US' })

  it('nests invitees and names a removed one plainly', () => {
    render(
      <InviteTree
        f={f}
        roots={[
          {
            userId: 'sam',
            name: 'Sam',
            joinedAt: null,
            children: [
              { userId: 'ana', name: 'Ana', joinedAt: new Date('2026-10-01T12:00:00Z'), children: [] },
              { userId: null, name: null, joinedAt: new Date('2026-09-01T12:00:00Z'), children: [] },
            ],
          },
        ]}
      />
    )
    expect(within(screen.getByTestId('admin-affiliates-tree-node-sam')).getByTestId('admin-affiliates-tree-node-ana')).toHaveTextContent('Ana, joined Oct 1, 2026')
    expect(screen.getByTestId('admin-affiliates-tree-removed')).toHaveTextContent('a removed member')
  })

  it('heads the joins of removed affiliates as "A removed member"', () => {
    render(<InviteTree f={f} roots={[{ userId: null, name: null, joinedAt: null, children: [{ userId: 'ana', name: 'Ana', joinedAt: null, children: [] }] }]} />)
    expect(screen.getByTestId('admin-affiliates-tree-removed-root')).toHaveTextContent(/^A removed memberAna$/)
  })

  it('shows the empty state', () => {
    render(<InviteTree f={f} roots={[]} />)
    expect(screen.getByTestId('admin-affiliates-tree-empty')).toBeInTheDocument()
  })
})

describe('HistoryTab', () => {
  it('shows the reason, or the cause when there is none, and the blocks with Unblock', () => {
    render(
      <HistoryTab
        applications={[
          { id: 'h1', member: SAM, status: 'REVOKED', reason: 'Sold invites', endCause: null, at: new Date('2026-10-02T12:00:00Z') },
          { id: 'h2', member: SAM, status: 'ENDED', reason: null, endCause: 'DISABLED', at: null },
        ]}
        blocks={[{ id: 'b1', createdAt: new Date('2026-10-03T12:00:00Z'), createdBy: 'Mike', hashPrefix: 'abcdef01' }]}
      />
    )
    expect(screen.getByTestId('admin-affiliates-history-row-h1')).toHaveTextContent('Sold invites')
    expect(screen.getByTestId('admin-affiliates-history-row-h2')).toHaveTextContent('Account disabled')
    expect(screen.getByTestId('admin-affiliates-blocks-row-b1')).toHaveTextContent('abcdef01')
    expect(screen.getByTestId('admin-affiliates-unblock-b1')).toBeInTheDocument()
  })
})

describe('AffiliateTabs', () => {
  it('puts the chosen tab in the URL', async () => {
    const user = userEvent.setup()
    render(
      <AffiliateTabs tabs={[{ value: 'applications', label: 'Applications' }, { value: 'tree', label: 'Invite tree' }]} active="applications">
        <p>panel</p>
      </AffiliateTabs>
    )
    await user.click(screen.getByTestId('admin-affiliates-tab-tree'))
    expect(currentHref()).toBe('/admin/affiliates?tab=tree')
  })
})
