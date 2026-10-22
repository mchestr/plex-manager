import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SettingsJumpTo, SettingsNav, type SettingsNavItem } from '@/components/admin/settings/settings-nav'

const ITEMS: SettingsNavItem[] = [
  { id: 'plex', label: 'Plex server', group: 'Media', status: 'ok' },
  { id: 'tautulli', label: 'Tautulli', group: 'Media', status: 'unreachable' },
  { id: 'overseerr', label: 'Overseerr', group: 'Media', status: 'untested' },
  { id: 'ai', label: 'AI provider', group: 'Features', status: 'degraded' },
  { id: 'discord', label: 'Discord', group: 'Features', status: 'incomplete' },
  { id: 'stripe', label: 'Stripe billing', group: 'Features', status: 'disabled' },
  { id: 'other', label: 'Other integrations', group: 'More', status: 'notConfigured' },
  { id: 'system', label: 'System information', group: 'More' },
]

const glyph = (id: string) => within(screen.getByTestId(`settings-nav-${id}`)).queryAllByRole('img')

describe('SettingsNav', () => {
  it('labels each glyph with its 5.6 category, by shape as well as colour', () => {
    render(<SettingsNav items={ITEMS} active="plex" dirty={new Set()} />)

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
    render(<SettingsNav items={ITEMS} active="tautulli" dirty={new Set()} />)

    expect(screen.getByRole('link', { name: /Tautulli/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: /Plex server/ })).not.toHaveAttribute('aria-current')
  })

  it('adds the Unsaved changes pip before the glyph of a dirty section', () => {
    render(<SettingsNav items={ITEMS} active="plex" dirty={new Set(['overseerr'])} />)

    const images = glyph('overseerr')
    expect(images.map((image) => image.getAttribute('aria-label'))).toEqual(['Unsaved changes', 'Off, not set up or not checked'])
    expect(glyph('plex')).toHaveLength(1)
  })

  it('shows the legend with the same five entries', () => {
    render(<SettingsNav items={ITEMS} active="plex" dirty={new Set()} />)

    expect(screen.getByTestId('settings-nav-legend')).toHaveTextContent(
      'WorkingNeeds attentionNot workingOff, not set up or not checkedUnsaved changes'
    )
  })

  it('scrolls to the anchor when a link is clicked', async () => {
    const user = userEvent.setup()
    document.body.insertAdjacentHTML('beforeend', '<section id="stripe"></section>')
    const target = document.getElementById('stripe')!
    target.scrollIntoView = jest.fn()
    render(<SettingsNav items={ITEMS} active="plex" dirty={new Set()} />)

    await user.click(screen.getByRole('link', { name: /Stripe billing/ }))

    expect(target.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }))
    expect(window.location.hash).toBe('#stripe')
    target.remove()
  })
})

describe('SettingsJumpTo', () => {
  it('scrolls to the chosen section', async () => {
    const user = userEvent.setup()
    document.body.insertAdjacentHTML('beforeend', '<section id="discord"></section>')
    const target = document.getElementById('discord')!
    target.scrollIntoView = jest.fn()
    render(<SettingsJumpTo items={ITEMS} active="plex" />)

    await user.click(screen.getByRole('combobox', { name: 'Jump to section' }))
    const option = await screen.findByTestId('settings-jump-to-option-discord')
    await waitFor(() => expect(option.closest('[style*="pointer-events: none"]')).toBeNull())
    await user.click(option)

    expect(target.scrollIntoView).toHaveBeenCalled()
    target.remove()
  })
})
