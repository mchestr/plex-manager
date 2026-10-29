/**
 * The Invites page body: each standing state's copy, the apply form, the
 * Tautulli-down message after a failed live check, and for an affiliate the
 * allowance line, the cap, Make with its preview and link, open invites
 * (copy, cancel) and the joins.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { applyForAffiliate, cancelAffiliateInvite, createAffiliateInvite } from '@/actions/affiliate'
import { InvitesView } from '@/components/invites/invites-view'
import { ServerNameProvider } from '@/lib/brand-context'
import type { Standing } from '@/lib/affiliates/standing'
import type { AffiliatePanel, InvitesPageData } from '@/lib/member/invites'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)
jest.mock('@/actions/affiliate', () => ({ applyForAffiliate: jest.fn(), createAffiliateInvite: jest.fn(), cancelAffiliateInvite: jest.fn() }))
const mockShowSuccess = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: jest.fn() }) }))

const writeText = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  writeText.mockResolvedValue(undefined)
})

/** userEvent puts its own clipboard on `navigator`, so the stub goes in after it. */
function setupUser() {
  const user = userEvent.setup()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return user
}

const PANEL: AffiliatePanel = {
  allowance: 3,
  free: 1,
  nextBackAt: new Date('2026-11-12T12:00:00Z'),
  capReached: null,
  open: [{ id: 'open-1', code: 'ABCD2345', label: 'For Ana', expiresAt: new Date('2026-10-31T12:00:00Z') }],
  joined: [
    { id: 'j-1', joinedAt: new Date('2026-10-01T12:00:00Z'), name: 'Ana', status: 'active' },
    { id: 'j-2', joinedAt: new Date('2026-09-01T12:00:00Z'), name: 'Bo', status: 'left' },
    { id: 'j-3', joinedAt: new Date('2026-08-01T12:00:00Z'), name: null, status: 'removed' },
  ],
}

function view(standing: Standing, affiliate: AffiliatePanel | null = null, inviterName: string | null = 'Sam') {
  const data: InvitesPageData = { inviterName, standing, affiliate }
  return render(
    <ServerNameProvider value="Northfield Plex">
      <InvitesView data={data} />
    </ServerNameProvider>
  )
}

const card = () => screen.getByTestId('invites-standing')

describe('standing card', () => {
  it.each([
    [{ state: 'pending', appliedAt: new Date('2026-10-20T12:00:00Z') } as Standing, 'You applied on October 20, 2026.'],
    [{ state: 'approved' } as Standing, 'Each invite is for one person and works for 48 hours.'],
    [{ state: 'paused' } as Standing, 'You can make invites again when your subscription ends.'],
    [{ state: 'paid' } as Standing, "Members with a paid subscription can't apply."],
    [{ state: 'revoked', reason: null, applyAgainAt: new Date('2026-11-28T12:00:00Z') } as Standing, 'You can apply again on November 28, 2026.'],
  ])('shows %o', (standing, text) => {
    view(standing)
    expect(card()).toHaveAttribute('data-state', standing.state)
    expect(card()).toHaveTextContent(text)
    expect(screen.queryByTestId('invites-apply-submit')).not.toBeInTheDocument()
  })

  it('keeps Apply below the bar, since Apply checks the watch time again', () => {
    view({ state: 'below_bar', hours: 23.7, barHours: 50 })
    expect(card()).toHaveAttribute('data-state', 'below_bar')
    expect(card()).toHaveTextContent('You had 23 h at the last check; you can apply at more than 50 h. Apply checks your watch time again.')
    expect(screen.getByTestId('invites-apply-submit')).toBeInTheDocument()
  })

  it('shows a refusal with its reason', () => {
    view({ state: 'refused', reason: 'Your account is too new.', applyAgainAt: new Date('2026-11-28T12:00:00Z') })
    expect(screen.getByTestId('invites-standing-reason')).toHaveTextContent('Reason: Your account is too new.')
  })

  it('applies with the note', async () => {
    jest.mocked(applyForAffiliate).mockResolvedValue({ success: true, data: null })
    const user = setupUser()
    view({ state: 'can_apply', hours: null })

    await user.type(screen.getByTestId('invites-apply-note'), 'I share good picks')
    await user.click(screen.getByTestId('invites-apply-submit'))

    expect(applyForAffiliate).toHaveBeenCalledWith({ note: 'I share good picks' })
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Application sent'))
  })

  it('shows the Tautulli-down message after a failed live check', async () => {
    jest.mocked(applyForAffiliate).mockResolvedValue({ success: false, code: 'HOURS_UNAVAILABLE', error: "We can't check your watch time now. Try again later." })
    const user = setupUser()
    view({ state: 'can_apply', hours: 120 })

    await user.click(screen.getByTestId('invites-apply-submit'))

    expect(await screen.findByTestId('invites-hours-unavailable')).toBeInTheDocument()
    expect(screen.getByTestId('invites-apply-note-error')).toHaveTextContent("We can't check your watch time now.")
  })

  it('shows another refusal under the note only', async () => {
    jest.mocked(applyForAffiliate).mockResolvedValue({ success: false, code: 'CONFLICT', error: 'You already applied.' })
    const user = setupUser()
    view({ state: 'can_apply', hours: 120 })

    await user.click(screen.getByTestId('invites-apply-submit'))

    expect(await screen.findByTestId('invites-apply-note-error')).toHaveTextContent('You already applied.')
    expect(screen.queryByTestId('invites-hours-unavailable')).not.toBeInTheDocument()
  })
})

describe('affiliate panel', () => {
  it('shows the allowance line, and the cap with its date', () => {
    view({ state: 'approved' }, { ...PANEL, capReached: { backAt: new Date('2026-11-02T12:00:00Z') } })
    expect(screen.getByTestId('invites-allowance')).toHaveTextContent('3 every 30 days, 1 free now, next back on Nov 12')
    expect(screen.getByTestId('invites-cap-reached')).toHaveTextContent('The server has no free invites now. One comes back on Nov 2.')
    expect(screen.getByTestId('invites-make-open')).toBeDisabled()
  })

  it('stops Make for a paused affiliate, who still has free places', () => {
    view({ state: 'paused' }, PANEL)
    expect(screen.getByTestId('invites-allowance')).toHaveTextContent('1 free now')
    expect(screen.getByTestId('invites-make-open')).toBeDisabled()
  })

  it('leaves out the date when nothing is held, and stops Make with no free place', () => {
    view({ state: 'approved' }, { ...PANEL, free: 0, nextBackAt: null, capReached: { backAt: null } })
    expect(screen.getByTestId('invites-allowance')).toHaveTextContent(/^3 every 30 days, 0 free now$/)
    expect(screen.getByTestId('invites-cap-reached')).toHaveTextContent(/^The server has no free invites now\.$/)
    expect(screen.getByTestId('invites-make-open')).toBeDisabled()
  })

  it('makes an invite with a label, previews the headline and copies the link', async () => {
    jest.mocked(createAffiliateInvite).mockResolvedValue({ success: true, data: { code: 'WXYZ6789', expiresAt: '2026-10-31T12:00:00Z' } })
    const user = setupUser()
    view({ state: 'approved' }, PANEL)

    await user.click(screen.getByTestId('invites-make-open'))
    expect(await screen.findByTestId('invites-make-preview')).toHaveTextContent('Sam invited you to Northfield Plex')
    await user.type(screen.getByTestId('invites-make-label-input'), 'For Bo')
    await user.click(screen.getByTestId('invites-make-submit'))

    expect(createAffiliateInvite).toHaveBeenCalledWith({ label: 'For Bo' })
    expect(await screen.findByTestId('invites-make-link')).toHaveTextContent('/invite/WXYZ6789')
    await user.click(screen.getByTestId('invites-make-copy'))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite/WXYZ6789`)
  })

  it('previews the plain headline without a name, and shows a refusal in the dialog', async () => {
    jest.mocked(createAffiliateInvite).mockResolvedValue({ success: false, code: 'HOURS_UNAVAILABLE', error: "We can't check your watch time now. Try again later." })
    const user = setupUser()
    view({ state: 'approved' }, PANEL, null)

    await user.click(screen.getByTestId('invites-make-open'))
    expect(await screen.findByTestId('invites-make-preview')).toHaveTextContent("You're invited to Northfield Plex")
    await user.click(screen.getByTestId('invites-make-submit'))

    expect(await screen.findByTestId('invites-make-error')).toHaveTextContent("We can't check your watch time now.")
    expect(screen.getByTestId('invites-hours-unavailable')).toBeInTheDocument()
  })

  it('copies and cancels an open invite', async () => {
    jest.mocked(cancelAffiliateInvite).mockResolvedValue({ success: true, data: null })
    const user = setupUser()
    view({ state: 'approved' }, PANEL)

    const row = screen.getByTestId('invites-open-row-open-1')
    expect(row).toHaveTextContent('For Ana')
    await user.click(within(row).getByTestId('invites-open-copy-open-1'))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite/ABCD2345`)

    await user.click(screen.getByTestId('invites-open-cancel-open-1'))
    await user.click(await screen.findByTestId('invites-open-cancel-confirm-open-1'))
    expect(cancelAffiliateInvite).toHaveBeenCalledWith({ inviteId: 'open-1' })
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Invite cancelled'))
  })

  it('shows an empty open list', () => {
    view({ state: 'approved' }, { ...PANEL, open: [], joined: [] })
    expect(screen.getByTestId('invites-open-empty')).toBeInTheDocument()
    expect(screen.getByTestId('invites-joined-empty')).toBeInTheDocument()
  })

  it('shows who joined, and only the date for a member who left the server', () => {
    view({ state: 'approved' }, PANEL)
    expect(screen.getByTestId('invites-joined-row-j-1')).toHaveTextContent('Ana')
    expect(screen.getByTestId('invites-joined-status-j-1')).toHaveTextContent('Active')
    expect(screen.getByTestId('invites-joined-status-j-2')).toHaveTextContent('No longer a member')
    const removed = screen.getByTestId('invites-joined-row-j-3')
    expect(removed).toHaveTextContent('A member who left')
    expect(removed).toHaveTextContent('Joined August 1, 2026')
    expect(screen.queryByTestId('invites-joined-status-j-3')).not.toBeInTheDocument()
  })
})
