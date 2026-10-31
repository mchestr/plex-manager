import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { SettingsGroup, SettingsLayout } from '@/components/admin/settings/settings-layout'
import type { SettingsNavItem } from '@/components/admin/settings/settings-groups'
import { SettingsSection } from '@/components/ui/settings-section'

const ITEMS: SettingsNavItem[] = [
  { id: 'plex', label: 'Plex server', group: 'media', status: 'ok' },
  { id: 'stripe', label: 'Stripe billing', group: 'members', status: 'ok' },
  { id: 'system', label: 'System information', group: 'system' },
]

function renderLayout() {
  return render(
    <SettingsLayout items={ITEMS}>
      <SettingsGroup id="media">
        <section id="plex">
          Plex
          <input aria-label="Plex name" />
        </section>
      </SettingsGroup>
      <SettingsGroup id="members">
        <section id="stripe">Stripe</section>
      </SettingsGroup>
      <SettingsGroup id="system">
        <section id="system">Runtime facts</section>
        <a id="time-zone" href="#time-zone">
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
    expect(screen.getByText('Runtime facts')).not.toBeVisible()
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

    expect(screen.getByText('Runtime facts')).toBeVisible()
    expect(window.location.hash).toBe('#time-zone')
  })

  it('ignores a malformed or unknown hash', () => {
    window.history.replaceState(null, '', '/#%')
    renderLayout()
    expect(screen.getByText('Plex')).toBeVisible()

    window.history.replaceState(null, '', '/#nowhere')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(screen.getByText('Plex')).toBeVisible()
  })

  it('keeps an unsaved edit in a hidden group', async () => {
    const user = userEvent.setup()
    renderLayout()

    await user.type(screen.getByLabelText('Plex name'), 'edited')
    await user.click(screen.getAllByRole('link', { name: /Stripe billing/ })[0])
    expect(screen.getByLabelText('Plex name', { selector: 'input' })).not.toBeVisible()
    await user.click(screen.getAllByRole('link', { name: /Plex server/ })[0])

    expect(screen.getByLabelText('Plex name')).toHaveValue('edited')
  })

  it('has the browser ask before leaving only while a section has unsaved changes', async () => {
    const user = userEvent.setup()
    /** A section whose form is dirty while its name differs from "Home". */
    function PlexSection() {
      const [name, setName] = useState('Home')
      const form = { isDirty: name !== 'Home', isPending: false, onDiscard: () => setName('Home'), onSave: async () => true }
      return (
        <SettingsSection id="plex" title="Plex server" description="Server" form={form} view={<p>{name}</p>}>
          <input aria-label="Plex name" value={name} onChange={(event) => setName(event.target.value)} />
        </SettingsSection>
      )
    }
    render(
      <SettingsLayout items={ITEMS}>
        <SettingsGroup id="media">
          <PlexSection />
        </SettingsGroup>
      </SettingsLayout>
    )
    const leave = () => window.dispatchEvent(new Event('beforeunload', { cancelable: true }))

    expect(leave()).toBe(true)

    await user.click(screen.getByTestId('settings-plex-edit'))
    expect(leave()).toBe(true)
    await user.type(screen.getByRole('textbox', { name: 'Plex name' }), 'x')
    // dispatchEvent returns false once a listener prevented it: the browser asks.
    // The listener follows the section's dirty report, an effect later, so wait for it
    await waitFor(() => expect(leave()).toBe(false))

    await user.click(screen.getByTestId('settings-plex-cancel'))
    await user.click(await screen.findByTestId('settings-plex-discard-dialog-confirm'))
    expect(await screen.findByText('Home')).toBeInTheDocument()
    await waitFor(() => expect(leave()).toBe(true))
  })
})
