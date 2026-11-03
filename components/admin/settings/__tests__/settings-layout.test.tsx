import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { leaveIsGuarded } from '@/__tests__/helpers/leave-guard'
import { replaceMock, resetUrl } from '@/__tests__/helpers/url-router'
import { SettingsGroup, SettingsLayout } from '@/components/admin/settings/settings-layout'
import type { SettingsNavItem } from '@/components/admin/settings/settings-groups'
import { SettingsSection } from '@/components/ui/settings-section'

jest.mock('next/navigation', () => require('@/__tests__/helpers/url-router').navigationModule)

const ITEMS: SettingsNavItem[] = [
  { id: 'plex', label: 'Plex server', group: 'connections', status: 'ok' },
  { id: 'stripe', label: 'Stripe billing', group: 'billing', status: 'ok' },
  { id: 'system', label: 'System information', group: 'system' },
]

function renderLayout() {
  return render(
    <SettingsLayout items={ITEMS}>
      <SettingsGroup id="connections">
        <section id="plex">
          Plex
          <input aria-label="Plex name" />
        </section>
      </SettingsGroup>
      <SettingsGroup id="billing">
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
    resetUrl('/admin/settings')
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

  describe('a hash from before its section moved to its feature page', () => {
    it.each([
      ['rewind', '/admin/rewind/settings'],
      ['ai', '/admin/ai/settings'],
      ['channel-stats', '/admin/discord/settings'],
      ['request-tiers', '/admin/request-limits'],
    ])('opens the page #%s moved to', (id, page) => {
      window.history.replaceState(null, '', `/#${id}`)
      renderLayout()

      expect(replaceMock).toHaveBeenCalledTimes(1)
      expect(replaceMock).toHaveBeenCalledWith(page)
    })

    it('follows a hash that arrives after the page has loaded', () => {
      renderLayout()
      expect(replaceMock).not.toHaveBeenCalled()

      window.history.replaceState(null, '', '/#discord')
      window.dispatchEvent(new HashChangeEvent('hashchange'))

      expect(replaceMock).toHaveBeenCalledTimes(1)
      expect(replaceMock).toHaveBeenCalledWith('/admin/discord/settings')
    })

    it.each(['', 'plex', 'stripe', 'time-zone', 'nowhere', 'constructor', '%'])('leaves #%s on the settings page', (id) => {
      window.history.replaceState(null, '', `/#${id}`)
      renderLayout()

      expect(replaceMock).not.toHaveBeenCalled()
    })
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
        <SettingsGroup id="connections">
          <PlexSection />
        </SettingsGroup>
      </SettingsLayout>
    )

    expect(leaveIsGuarded()).toBe(false)

    await user.click(screen.getByTestId('settings-plex-edit'))
    expect(leaveIsGuarded()).toBe(false)
    await user.type(screen.getByRole('textbox', { name: 'Plex name' }), 'x')
    // The listener follows the section's dirty report, an effect later, so wait for it
    await waitFor(() => expect(leaveIsGuarded()).toBe(true))

    await user.click(screen.getByTestId('settings-plex-cancel'))
    await user.click(await screen.findByTestId('settings-plex-discard-dialog-confirm'))
    expect(await screen.findByText('Home')).toBeInTheDocument()
    await waitFor(() => expect(leaveIsGuarded()).toBe(false))
  })
})
