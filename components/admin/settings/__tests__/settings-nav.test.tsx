import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { SettingsNavItem } from '@/components/admin/settings/settings-groups'
import { SettingsJumpTo, SettingsNav } from '@/components/admin/settings/settings-nav'

const ITEMS: SettingsNavItem[] = [
  { id: 'plex', label: 'Plex server', group: 'media', status: 'ok' },
  { id: 'tautulli', label: 'Tautulli', group: 'media', status: 'unreachable' },
  { id: 'overseerr', label: 'Overseerr', group: 'media', status: 'untested' },
  { id: 'other', label: 'Sonarr, Radarr, Jellyfin', group: 'media', status: 'notConfigured' },
  { id: 'stripe', label: 'Stripe billing', group: 'members', status: 'disabled' },
  { id: 'ai', label: 'AI provider', group: 'ai', status: 'degraded' },
  { id: 'discord', label: 'Discord', group: 'discord', status: 'incomplete' },
  { id: 'system', label: 'System information', group: 'system' },
]

const glyph = (id: string) => within(screen.getByTestId(`settings-nav-${id}`)).queryAllByRole('img')

describe('SettingsNav', () => {
  it('labels each glyph with its 5.6 category, by shape as well as colour', () => {
    render(<SettingsNav items={ITEMS} active="plex" activeGroup="media" dirty={new Set()} onSelect={jest.fn()} />)

    expect(glyph('plex')[0]).toHaveAccessibleName('Working')
    expect(glyph('tautulli')[0]).toHaveAccessibleName('Not working')
    expect(glyph('ai')[0]).toHaveAccessibleName('Needs attention')
    expect(glyph('discord')[0]).toHaveAccessibleName('Needs attention')
    for (const id of ['overseerr', 'stripe', 'other']) {
      expect(glyph(id)[0]).toHaveAccessibleName('Off, not set up or not checked')
    }
    expect(glyph('system')).toHaveLength(0)
    // One shape per category
    expect(glyph('plex')[0]).toHaveAttribute('data-category', 'working')
    expect(glyph('tautulli')[0]).toHaveAttribute('data-category', 'broken')
  })

  it('marks the section in view with aria-current', () => {
    render(<SettingsNav items={ITEMS} active="tautulli" activeGroup="media" dirty={new Set()} onSelect={jest.fn()} />)

    expect(screen.getByRole('link', { name: /Tautulli/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: /Plex server/ })).not.toHaveAttribute('aria-current')
  })

  it('adds the Unsaved changes pip before the glyph of a dirty section', () => {
    render(<SettingsNav items={ITEMS} active="plex" activeGroup="media" dirty={new Set(['overseerr'])} onSelect={jest.fn()} />)

    const images = glyph('overseerr')
    expect(images.map((image) => image.getAttribute('aria-label'))).toEqual(['Unsaved changes', 'Off, not set up or not checked'])
    expect(glyph('plex')).toHaveLength(1)
  })

  it('shows the legend with the same five entries', () => {
    render(<SettingsNav items={ITEMS} active="plex" activeGroup="media" dirty={new Set()} onSelect={jest.fn()} />)

    expect(screen.getByTestId('settings-nav-legend')).toHaveTextContent(
      'WorkingNeeds attentionNot workingOff, not set up or not checkedUnsaved changes'
    )
  })

  it('heads the sections with their groups, in order', () => {
    render(<SettingsNav items={ITEMS} active="plex" activeGroup="media" dirty={new Set()} onSelect={jest.fn()} />)

    const headings = ['media', 'members', 'ai', 'discord', 'rewind', 'system'].map(
      (id) => screen.getByTestId(`settings-nav-group-${id}`).firstElementChild?.textContent
    )
    expect(headings).toEqual(['Media', 'Members', 'AI', 'Discord', 'Rewind', 'System'])
    expect(within(screen.getByTestId('settings-nav-group-media')).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Plex server',
      'Tautulli',
      'Overseerr',
      'Sonarr, Radarr, Jellyfin',
    ])
  })

  it('marks the active group and hands a clicked section to onSelect', async () => {
    const user = userEvent.setup()
    const onSelect = jest.fn()
    render(<SettingsNav items={ITEMS} active="plex" activeGroup="members" dirty={new Set()} onSelect={onSelect} />)

    expect(within(screen.getByTestId('settings-nav-group-members')).getByText('Members')).toHaveAttribute('data-active', 'true')
    expect(within(screen.getByTestId('settings-nav-group-media')).getByText('Media')).not.toHaveAttribute('data-active')

    await user.click(screen.getByRole('link', { name: /Stripe billing/ }))

    expect(onSelect).toHaveBeenCalledWith('stripe')
  })
})

describe('SettingsJumpTo', () => {
  it('hands the chosen section to onSelect', async () => {
    const user = userEvent.setup()
    const onSelect = jest.fn()
    render(<SettingsJumpTo items={ITEMS} active="plex" onSelect={onSelect} />)

    await user.click(screen.getByRole('combobox', { name: 'Jump to section' }))
    const option = await screen.findByTestId('settings-jump-to-option-discord')
    await waitFor(() => expect(option.closest('[style*="pointer-events: none"]')).toBeNull())
    await user.click(option)

    expect(onSelect).toHaveBeenCalledWith('discord')
  })
})
