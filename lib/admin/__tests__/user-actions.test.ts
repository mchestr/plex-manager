import { makeAdminUserWithStats } from '@/__tests__/utils/test-builders'
import { listUserTarget, type UserActionContext, userActionIds } from '@/lib/admin/user-actions'

const NOW = Date.parse('2026-12-03T12:00:00Z')
const LIST: UserActionContext = { now: NOW, stripeEnabled: false, hasStripeDashboard: false, inList: true }
const BILLING: UserActionContext = { ...LIST, stripeEnabled: true, hasStripeDashboard: true }

const target = (overrides: Parameters<typeof makeAdminUserWithStats>[0] = {}) => listUserTarget(makeAdminUserWithStats(overrides))

describe('userActionIds', () => {
  it('offers a member everything but billing with Stripe off, the destructive pair last', () => {
    expect(userActionIds(target(), LIST)).toEqual(['view', 'rewind', 'regenerate', 'role', 'supportRole', 'disable', 'removeAccess'])
  })

  it('adds Grant, Toggle exempt, Cancel and View in Stripe with Stripe on', () => {
    const user = target({ subscriptionStatus: 'ACTIVE', stripeCustomerId: 'cus_1' })
    expect(userActionIds(user, BILLING)).toEqual([
      'view', 'rewind', 'regenerate', 'role', 'supportRole', 'grant', 'exempt', 'cancel', 'stripe', 'disable', 'removeAccess',
    ])
    expect(userActionIds(target({ isExempt: true, subscriptionStatus: 'CANCELED' }), BILLING)).not.toContain('grant')
    expect(userActionIds(target({ subscriptionStatus: 'CANCELED' }), BILLING)).not.toContain('cancel')
  })

  it('never offers the owner a role change, disabling or removal, nor billing for admins', () => {
    const owner = target({ isAdmin: true, isOwner: true })
    expect(userActionIds(owner, BILLING)).toEqual(['view', 'rewind', 'regenerate'])
    expect(userActionIds(target({ isAdmin: true }), BILLING)).toEqual(['view', 'rewind', 'regenerate', 'role', 'disable'])
  })

  it('offers Regenerate only for a missing, finished or stuck run (UI-29)', () => {
    const minutesAgo = (m: number) => new Date(NOW - m * 60_000)
    expect(userActionIds(target({ wrappedStatus: 'completed', wrappedRunStartedAt: minutesAgo(14) }), LIST)).not.toContain('regenerate')
    expect(userActionIds(target({ wrappedStatus: 'completed', wrappedRunStartedAt: minutesAgo(16) }), LIST)).toContain('regenerate')
    expect(userActionIds(target({ wrappedStatus: null }), LIST)).toContain('regenerate')
  })

  it('offers removal for unknown access but not without a Plex account or once unshared', () => {
    expect(userActionIds(target({ hasPlexAccess: null }), LIST)).toContain('removeAccess')
    expect(userActionIds(target({ hasPlexAccess: false }), LIST)).not.toContain('removeAccess')
    expect(userActionIds(target({ plexUserId: null, hasPlexAccess: null }), LIST)).not.toContain('removeAccess')
  })

  it('leaves View details and View Rewind off the detail page, which has its own button', () => {
    expect(userActionIds(target(), { ...LIST, inList: false })[0]).toBe('regenerate')
  })
})

describe('listUserTarget', () => {
  it('names a member by their email when they have no name, and reads disabled from the date', () => {
    expect(target({ name: null, email: 'sam@example.com', disabledAt: new Date(NOW) })).toMatchObject({
      name: 'sam@example.com',
      disabled: true,
      plexAccess: 'shared',
    })
  })
})
