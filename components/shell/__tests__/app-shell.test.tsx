/**
 * The member shell (P6.3, ui-design-system 6.1): the active link, the account
 * menu by keyboard, the mobile Sheet, the notice slot and the Rewind routes
 * that draw their own chrome.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { signOut } from 'next-auth/react'
import { usePathname } from 'next/navigation'

import { AppShell } from '@/components/shell/app-shell'
import { MemberNav } from '@/components/shell/member-nav'
import { memberNav } from '@/lib/member/nav'
import type { MemberNotice } from '@/lib/member/notice-rules'
import type { ShellUser } from '@/lib/member/shell'

expect.extend(toHaveNoViolations)

jest.mock('next-auth/react', () => ({ signOut: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/actions/appearance', () => ({ setAppearance: jest.fn() }))

const push = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: () => ({ push, refresh }),
}))

const mockPathname = usePathname as jest.Mock

// The chrome is a `next/dynamic` chunk in the app; here it renders at once.
jest.mock('@/components/subscription/subscription-banners', () => ({ SubscriptionBanners: () => null }))
jest.mock('next/dynamic', () => () => require('@/components/shell/app-chrome').AppChrome)

const OUTAGE: MemberNotice = { kind: 'outage', serviceName: 'Plex' }

const member: ShellUser = { name: 'Theo Marsh', email: 'theo@example.com', initials: 'TM', isAdmin: false, membership: false }

function renderShell(user: ShellUser = member, notice?: MemberNotice) {
  return render(
    <AppShell serverName="Northfield Plex" user={user} nav={memberNav({ rewindYear: 2026, membership: false })} notice={notice}>
      <p>Page</p>
    </AppShell>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPathname.mockReturnValue('/')
})

describe('AppShell', () => {
  it('marks Home current on /, with no axe violations', async () => {
    mockPathname.mockReturnValue('/')
    const { container } = renderShell()

    expect(screen.getByTestId('member-nav-home')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('member-nav-rewind')).not.toHaveAttribute('aria-current')
    expect(screen.getByTestId('member-nav-rewind')).toHaveTextContent('Rewind 2026')
    expect(container.querySelectorAll('main#main')).toHaveLength(1)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('lights neither link on another member page', () => {
    mockPathname.mockReturnValue('/discord/link')
    renderShell()

    expect(screen.getByTestId('member-nav-home')).not.toHaveAttribute('aria-current')
    expect(screen.getByTestId('member-nav-rewind')).not.toHaveAttribute('aria-current')
  })

  it('marks Rewind current on its subpaths', () => {
    // The shell hides its bar on Rewind pages, so this reads the nav island itself.
    mockPathname.mockReturnValue('/rewind/2025/read')
    render(<MemberNav items={memberNav({ rewindYear: 2026, membership: false })} />)

    expect(screen.getByTestId('member-nav-rewind')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('member-nav-home')).not.toHaveAttribute('aria-current')
  })

  it('steps aside on Rewind pages, which draw their own chrome', () => {
    mockPathname.mockReturnValue('/rewind/2026')
    renderShell(member, OUTAGE)

    expect(screen.queryByTestId('app-top-bar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('app-notice')).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('Page')
  })

  it('renders the notice under the top bar', () => {
    renderShell(member, OUTAGE)

    expect(screen.getByTestId('app-notice')).toHaveTextContent('Plex is down')
  })

  it('opens the account menu by keyboard and signs out', async () => {
    const user = userEvent.setup()
    renderShell({ ...member, discordHandle: null })

    screen.getByTestId('account-menu-trigger').focus()
    await user.keyboard('{Enter}')
    const menu = await screen.findByRole('menu')

    expect(within(menu).getByText('Theo Marsh')).toBeInTheDocument()
    expect(within(menu).getByText('theo@example.com')).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Link Discord' })).toHaveAttribute('href', '/discord/link')
    expect(within(menu).queryByTestId('admin-dashboard-link')).not.toBeInTheDocument()

    // Opening from the keyboard highlights the first item.
    await waitFor(() => expect(within(menu).getByRole('menuitem', { name: 'Link Discord' })).toHaveFocus())
    await user.keyboard('{ArrowDown}')
    expect(within(menu).getByRole('menuitem', { name: 'Account settings' })).toHaveFocus()
    expect(within(menu).getByRole('menuitem', { name: 'Account settings' })).toHaveAttribute('href', '/account')
    await user.keyboard('{ArrowDown}')
    expect(screen.getByTestId('sign-out-button')).toHaveFocus()
    expect(await axe(document.body, { rules: { region: { enabled: false } } })).toHaveNoViolations()

    await user.keyboard('{Enter}')
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ redirect: false }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
  })

  it('shows the linked handle and Admin for a linked admin', async () => {
    const user = userEvent.setup()
    renderShell({ ...member, isAdmin: true, discordHandle: 'theo.marsh' })

    expect(screen.getByTestId('app-admin-link')).toHaveAttribute('href', '/admin')
    await user.click(screen.getByTestId('account-menu-trigger'))
    const menu = await screen.findByRole('menu')

    expect(within(menu).getByRole('menuitem', { name: 'Discord: linked as theo.marsh' })).toBeInTheDocument()
    expect(within(menu).getByTestId('admin-dashboard-link')).toHaveAttribute('href', '/admin')
  })

  it('offers no Discord item when Discord is off', async () => {
    const user = userEvent.setup()
    renderShell(member)

    await user.click(screen.getByTestId('account-menu-trigger'))
    const menu = await screen.findByRole('menu')

    expect(within(menu).queryByTestId('account-menu-discord')).not.toBeInTheDocument()
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2)
  })

  it('offers Membership in the account menu only when the page exists', async () => {
    const user = userEvent.setup()
    renderShell({ ...member, membership: true })

    await user.click(screen.getByTestId('account-menu-trigger'))
    const menu = await screen.findByRole('menu')

    expect(within(menu).getByRole('menuitem', { name: 'Membership' })).toHaveAttribute('href', '/membership')
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(3)
  })

  it('marks Help current on /help', () => {
    mockPathname.mockReturnValue('/help')
    renderShell()

    expect(screen.getByTestId('member-nav-help')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('member-nav-home')).not.toHaveAttribute('aria-current')
  })

  it('opens the mobile Sheet with the same links and closes it on navigation', async () => {
    const user = userEvent.setup()
    mockPathname.mockReturnValue('/discord/link')
    renderShell({ ...member, isAdmin: true })

    await user.click(screen.getByTestId('member-menu-button'))
    const sheet = await screen.findByRole('dialog', { name: 'Menu' })

    expect(within(sheet).getByTestId('member-nav-home-mobile')).toHaveAttribute('href', '/')
    expect(within(sheet).getByTestId('member-nav-rewind-mobile')).toHaveTextContent('Rewind 2026')
    expect(within(sheet).getByTestId('member-menu-admin')).toHaveAttribute('href', '/admin')
    expect(await axe(document.body, { rules: { region: { enabled: false } } })).toHaveNoViolations()

    await user.click(within(sheet).getByTestId('member-nav-home-mobile'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument())
  })
})
