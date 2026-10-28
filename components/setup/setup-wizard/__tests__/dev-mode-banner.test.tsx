/**
 * Tests for DevModeBanner: shown only while DEV_* variables pre-fill setup.
 */

import { render, screen } from '@testing-library/react'

import { DevModeBanner } from '@/components/setup/setup-wizard/dev-mode-banner'
import type { DevDefaults } from '@/types/setup'

function defaults(patch: Partial<DevDefaults> = {}): DevDefaults {
  return {
    plex: null,
    tautulli: null,
    overseerr: null,
    sonarr: null,
    radarr: null,
    discord: null,
    chatLlmProvider: null,
    wrappedLlmProvider: null,
    llmProvider: null,
    isDevMode: true,
    autoSubmit: false,
    ...patch,
  }
}

describe('DevModeBanner', () => {
  it('renders nothing outside dev mode', () => {
    const { container } = render(<DevModeBanner devDefaults={defaults({ isDevMode: false })} />)
    expect(container.firstChild).toBeNull()
  })

  it('warns, as an alert, that DEV_* variables fill the forms', () => {
    render(<DevModeBanner devDefaults={defaults({ plex: { name: 'Test Plex' } })} />)

    const banner = screen.getByTestId('dev-mode-banner')
    expect(banner).toHaveAttribute('role', 'alert')
    expect(banner).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('Development mode is on')).toBeInTheDocument()
    expect(screen.getByText('DEV_*')).toBeInTheDocument()
    expect(screen.getByText(/do not use them in production/i)).toBeInTheDocument()
    expect(document.querySelector('[data-slot="icon"]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('says when auto-submit is on, and only then', () => {
    const { rerender } = render(<DevModeBanner devDefaults={defaults()} />)
    expect(screen.queryByText(/auto-submit is on/i)).not.toBeInTheDocument()

    rerender(<DevModeBanner devDefaults={defaults({ autoSubmit: true })} />)
    expect(screen.getByText(/auto-submit is on/i)).toBeInTheDocument()
  })
})
