import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SettingsGroup, SettingsLayout } from '@/components/admin/settings/settings-layout'
import type { SettingsNavItem } from '@/components/admin/settings/settings-nav'

const ITEMS: SettingsNavItem[] = [
  { id: 'plex', label: 'Plex server', group: 'media', status: 'ok' },
  { id: 'stripe', label: 'Stripe billing', group: 'integrations', status: 'ok' },
  { id: 'system', label: 'System information', group: 'system' },
]

function renderLayout() {
  return render(
    <SettingsLayout items={ITEMS}>
      <SettingsGroup id="media">
        <section id="plex">Plex</section>
      </SettingsGroup>
      <SettingsGroup id="integrations">
        <section id="stripe">Stripe</section>
      </SettingsGroup>
      <SettingsGroup id="system">
        <section id="system">System</section>
        <a id="server-time-zone" href="#server-time-zone">
          zone
        </a>
      </SettingsGroup>
    </SettingsLayout>
  )
}

describe('SettingsLayout', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    Element.prototype.scrollIntoView = jest.fn()
  })

  it('shows the first group and keeps the others mounted but hidden', () => {
    renderLayout()

    expect(screen.getByText('Plex')).toBeVisible()
    expect(screen.getByText('Stripe')).not.toBeVisible()
    expect(screen.getByText('System')).not.toBeVisible()
  })

  it('reveals the group of a nav link and scrolls to the section', async () => {
    const user = userEvent.setup()
    renderLayout()

    await user.click(screen.getAllByRole('link', { name: /Stripe billing/ })[0])

    expect(screen.getByText('Stripe')).toBeVisible()
    expect(screen.getByText('Plex')).not.toBeVisible()
    expect(window.location.hash).toBe('#stripe')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('opens the group named by the URL hash', () => {
    window.history.replaceState(null, '', '/#stripe')
    renderLayout()

    expect(screen.getByText('Stripe')).toBeVisible()
  })

  it('reveals the group behind an in-page anchor that is not a section', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/#plex')
    renderLayout()

    await user.click(screen.getByText('zone', { selector: 'a' }))

    expect(screen.getByText('System')).toBeVisible()
    expect(window.location.hash).toBe('#server-time-zone')
  })
})
