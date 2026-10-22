/**
 * The Discord link checklist (P6.11, ui-design-system 6.6): three items, one
 * primary action for the next missing item, the privacy line, and Unlink and
 * Resync revalidating the route through their actions instead of asking for a
 * reload.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'

import { disconnectDiscordAccount, resyncDiscordRole } from '@/actions/discord'
import { DiscordLinkChecklist, type DiscordLinkChecklistProps } from '@/components/discord/link-checklist'

jest.mock('@/actions/discord', () => ({
  disconnectDiscordAccount: jest.fn(),
  resyncDiscordRole: jest.fn(),
}))
const mockRefresh = jest.fn()
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

expect.extend(toHaveNoViolations)

const CONNECT_URL = '/discord/connect?redirect=%2Fdiscord%2Flink'

const linked = { username: 'morgan.lee', globalName: 'Morgan', metadataSyncedAt: new Date('2026-11-01T12:00:00Z') }

function renderChecklist(overrides: Partial<DiscordLinkChecklistProps> = {}) {
  return render(
    <DiscordLinkChecklist
      plexAccount="morgan@mail.example"
      connection={null}
      isEnabled
      isOnServer={null}
      connectUrl={CONNECT_URL}
      serverName="Northfield Plex"
      serverInviteCode="abc"
      instructions={null}
      {...overrides}
    />
  )
}

const primaries = () => document.querySelectorAll('[data-primary]')
const stepDone = (id: string) => screen.getByTestId(`discord-link-step-${id}`).getAttribute('data-done')

beforeEach(() => {
  jest.clearAllMocks()
})

describe('DiscordLinkChecklist', () => {
  it('makes Link Discord the one primary when Discord is not linked, with Join as the secondary', async () => {
    const { container } = renderChecklist()

    expect(stepDone('plex')).toBe('true')
    expect(stepDone('discord')).toBe('false')
    expect(stepDone('role')).toBe('false')
    expect(within(screen.getByTestId('discord-link-step-plex')).getByText('Signed in as morgan@mail.example')).toBeInTheDocument()

    expect(primaries()).toHaveLength(1)
    expect(screen.getByTestId('discord-link-connect')).toHaveAttribute('href', CONNECT_URL)
    expect(screen.getByTestId('discord-link-connect')).toHaveAttribute('data-primary')
    const join = screen.getByTestId('discord-link-join-server')
    expect(join).toHaveAttribute('href', 'https://discord.gg/abc')
    expect(join).toHaveTextContent('Join the Northfield Plex Discord')
    expect(join).not.toHaveAttribute('data-primary')
    expect(screen.queryByTestId('discord-link-disconnect')).not.toBeInTheDocument()

    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows the privacy line', () => {
    renderChecklist()

    expect(screen.getByTestId('discord-link-privacy')).toHaveTextContent(
      'We keep your Discord ID and name to give you the member role. Unlink any time.'
    )
  })

  it('makes Join the primary when linked but not on the server', () => {
    renderChecklist({ connection: linked, isOnServer: false })

    expect(stepDone('discord')).toBe('true')
    expect(stepDone('role')).toBe('false')
    expect(primaries()).toHaveLength(1)
    expect(screen.getByTestId('discord-link-join-server')).toHaveAttribute('data-primary')
    expect(screen.queryByTestId('discord-link-connect')).not.toBeInTheDocument()
  })

  it('makes Resync the primary when linked but the role has not synced', () => {
    renderChecklist({ connection: { ...linked, metadataSyncedAt: null }, isOnServer: true })

    expect(stepDone('role')).toBe('false')
    expect(primaries()).toHaveLength(1)
    expect(screen.getByTestId('discord-link-resync')).toHaveAttribute('data-primary')
  })

  it('marks every item done and offers no primary once complete', () => {
    renderChecklist({ connection: linked, isOnServer: true })

    expect(['plex', 'discord', 'role'].map(stepDone)).toEqual(['true', 'true', 'true'])
    expect(screen.getByText('Linked as Morgan')).toBeInTheDocument()
    expect(primaries()).toHaveLength(0)
  })

  it('shows the Plex item open for an account with no Plex link', () => {
    renderChecklist({ plexAccount: null })

    expect(stepDone('plex')).toBe('false')
    expect(screen.getByTestId('discord-link-connect')).toHaveAttribute('data-primary')
  })

  it('shows the unavailable state while the integration is off', () => {
    renderChecklist({ isEnabled: false })

    expect(screen.getByTestId('discord-link-unavailable')).toBeInTheDocument()
    expect(screen.queryByTestId('discord-link-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('discord-link-connect')).not.toBeInTheDocument()
    expect(screen.getByTestId('discord-link-join-server')).toHaveAttribute('href', 'https://discord.gg/abc')
  })

  it('unlinks, and the action refreshes the route', async () => {
    const user = userEvent.setup()
    jest.mocked(disconnectDiscordAccount).mockResolvedValue({ success: true, data: null })
    renderChecklist({ connection: linked, isOnServer: true })

    await user.click(screen.getByTestId('discord-link-disconnect'))

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Discord unlinked'))
    // The action revalidates /discord/link, so no client refresh follows (P10.7)
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('resyncs, and the action refreshes the route', async () => {
    const user = userEvent.setup()
    jest.mocked(resyncDiscordRole).mockResolvedValue({ success: true, data: null })
    renderChecklist({ connection: linked, isOnServer: true })

    await user.click(screen.getByTestId('discord-link-resync'))

    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith('Member role synced'))
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('shows the error and does not refresh when resync fails', async () => {
    const user = userEvent.setup()
    jest.mocked(resyncDiscordRole).mockResolvedValue({ success: false, code: 'INTERNAL', error: 'Sync failed' })
    renderChecklist({ connection: linked, isOnServer: true })

    await user.click(screen.getByTestId('discord-link-resync'))

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Sync failed'))
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
