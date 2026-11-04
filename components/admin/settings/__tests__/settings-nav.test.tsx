import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { SettingsNavItem } from '@/components/admin/settings/settings-groups'
import { SettingsJumpTo, SettingsNav } from '@/components/admin/settings/settings-nav'

const ITEMS: SettingsNavItem[] = [
  { id: 'plex', label: 'Plex server', group: 'connections', status: 'ok' },
  { id: 'tautulli', label: 'Tautulli', group: 'connections', status: 'unreachable' },
  { id: 'overseerr', label: 'Overseerr', group: 'connections', status: 'untested' },
  { id: 'other', label: 'Sonarr, Radarr', group: 'connections', status: 'notConfigured' },
  { id: 'stripe', label: 'Stripe billing', group: 'billing', status: 'disabled' },
  { id: 'system', label: 'System information', group: 'system' },
]

const glyph = (id: string) => within(screen.getByTestId(`settings-nav-${id}`)).queryAllByRole('img')

describe('SettingsNav', () => {
  it('labels each glyph with its 5.6 category, by shape as well as colour', () => {
    render(<SettingsNav items={ITEMS} active="plex" activeGroup="connections" dirty={new Set()} onSelect={jest.fn()} />)

    expect(glyph('plex')[0]).toHaveAccessibleName('Working')
    expect(glyph('tautulli')[0]).toHaveAccessibleName('Not working')
    for (const id of ['overseerr', 'stripe', 'other']) {
      expect(glyph(id)[0]).toHaveAccessibleName('Off, not set up or not checked')
    }
    expect(glyph('system')).toHaveLength(0)
    // One shape per category
    expect(glyph('plex')[0]).toHaveAttribute('data-category', 'working')
    expect(glyph('tautulli')[0]).toHaveAttribute('data-category', 'broken')
  })

  it('draws Needs attention for an incomplete or degraded section, apart from Not working', () => {
    // The AI and Discord rows that used to cover this category left for their own pages
    const items: SettingsNavItem[] = [
      { id: 'plex', label: 'Plex server', group: 'connections', status: 'incomplete' },
      { id: 'tautulli', label: 'Tautulli', group: 'connections', status: 'degraded' },
      { id: 'overseerr', label: 'Overseerr', group: 'connections', status: 'unreachable' },
    ]
    render(<SettingsNav items={items} active="plex" activeGroup="connections" dirty={new Set()} onSelect={jest.fn()} />)

    for (const id of ['plex', 'tautulli']) {
      expect(glyph(id)[0]).toHaveAccessibleName('Needs attention')
      expect(glyph(id)[0]).toHaveAttribute('data-category', 'attention')
    }
    expect(glyph('overseerr')[0]).toHaveAccessibleName('Not working')
    expect(glyph('overseerr')[0]).toHaveAttribute('data-category', 'broken')
  })

  it('marks the section in view with aria-current', () => {
    render(<SettingsNav items={ITEMS} active="tautulli" activeGroup="connections" dirty={new Set()} onSelect={jest.fn()} />)

    expect(screen.getByRole('link', { name: /Tautulli/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: /Plex server/ })).not.toHaveAttribute('aria-current')
  })

  it('adds the Unsaved changes pip before the glyph of a dirty section', () => {
    render(<SettingsNav items={ITEMS} active="plex" activeGroup="connections" dirty={new Set(['overseerr'])} onSelect={jest.fn()} />)

    const images = glyph('overseerr')
    expect(images.map((image) => image.getAttribute('aria-label'))).toEqual(['Unsaved changes', 'Off, not set up or not checked'])
    expect(glyph('plex')).toHaveLength(1)
  })

  it('shows the legend with the same five entries', () => {
    render(<SettingsNav items={ITEMS} active="plex" activeGroup="connections" dirty={new Set()} onSelect={jest.fn()} />)

    expect(screen.getByTestId('settings-nav-legend')).toHaveTextContent(
      'WorkingNeeds attentionNot workingOff, not set up or not checkedUnsaved changes'
    )
  })

  it('heads the sections with their groups, in order', () => {
    render(<SettingsNav items={ITEMS} active="plex" activeGroup="connections" dirty={new Set()} onSelect={jest.fn()} />)

    const headings = ['connections', 'billing', 'system'].map(
      (id) => screen.getByTestId(`settings-nav-group-${id}`).firstElementChild?.textContent
    )
    expect(headings).toEqual(['Connections', 'Billing', 'System'])
    expect(within(screen.getByTestId('settings-nav-group-connections')).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Plex server',
      'Tautulli',
      'Overseerr',
      'Sonarr, Radarr',
    ])
  })

  it('marks the active group and hands a clicked section to onSelect', async () => {
    const user = userEvent.setup()
    const onSelect = jest.fn()
    render(<SettingsNav items={ITEMS} active="plex" activeGroup="billing" dirty={new Set()} onSelect={onSelect} />)

    expect(within(screen.getByTestId('settings-nav-group-billing')).getByText('Billing')).toHaveAttribute('data-active', 'true')
    expect(within(screen.getByTestId('settings-nav-group-connections')).getByText('Connections')).not.toHaveAttribute('data-active')

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
    const option = await screen.findByTestId('settings-jump-to-option-system')
    await waitFor(() => expect(option.closest('[style*="pointer-events: none"]')).toBeNull())
    await user.click(option)

    expect(onSelect).toHaveBeenCalledWith('system')
  })
})
