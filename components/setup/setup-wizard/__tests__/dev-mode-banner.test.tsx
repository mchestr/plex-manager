/**
 * Tests for DevModeBanner component
 */

import { DevModeBanner } from '@/components/setup/setup-wizard/dev-mode-banner'
import { render, screen } from '@testing-library/react'

describe('DevModeBanner', () => {
  describe('Rendering', () => {
    it('should not render when devDefaults is null', () => {
      const { container } = render(<DevModeBanner devDefaults={null} />)

      expect(container.firstChild).toBeNull()
    })

    it('should not render when isDevMode is false', () => {
      const devDefaults = {
        plex: null,
        tautulli: null,
        overseerr: null,
        sonarr: null,
        radarr: null,
        discord: null,
        chatLlmProvider: null,
        wrappedLlmProvider: null,
        llmProvider: null,
        isDevMode: false,
        autoSubmit: false,
      }

      const { container } = render(<DevModeBanner devDefaults={devDefaults} />)

      expect(container.firstChild).toBeNull()
    })

    it('should render when isDevMode is true', () => {
      const devDefaults = {
        plex: { name: 'Test Plex' },
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
      }

      render(<DevModeBanner devDefaults={devDefaults} />)

      expect(screen.getByTestId('dev-mode-banner')).toBeInTheDocument()
    })

    it('should render title "Development Mode Active"', () => {
      const devDefaults = {
        plex: { name: 'Test Plex' },
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
      }

      render(<DevModeBanner devDefaults={devDefaults} />)

      expect(screen.getByText('Development Mode Active')).toBeInTheDocument()
    })

    it('should mention DEV_* environment variables', () => {
      const devDefaults = {
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
      }

      render(<DevModeBanner devDefaults={devDefaults} />)

      expect(screen.getByText('DEV_*')).toBeInTheDocument()
    })

    it('should show security warning about production', () => {
      const devDefaults = {
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
      }

      render(<DevModeBanner devDefaults={devDefaults} />)

      expect(screen.getByText(/should never be used in production/i)).toBeInTheDocument()
    })
  })

  describe('Auto-Submit Feature', () => {
    it('should not show auto-submit message when autoSubmit is false', () => {
      const devDefaults = {
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
      }

      render(<DevModeBanner devDefaults={devDefaults} />)

      expect(screen.queryByText(/auto-submit is enabled/i)).not.toBeInTheDocument()
    })

    it('should show auto-submit message when autoSubmit is true', () => {
      const devDefaults = {
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
        autoSubmit: true,
      }

      render(<DevModeBanner devDefaults={devDefaults} />)

      expect(screen.getByText(/auto-submit is enabled/i)).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    const devDefaults = {
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
    }

    it('should have role="alert"', () => {
      render(<DevModeBanner devDefaults={devDefaults} />)

      const banner = screen.getByTestId('dev-mode-banner')
      expect(banner).toHaveAttribute('role', 'alert')
    })

    it('should have aria-live="polite"', () => {
      render(<DevModeBanner devDefaults={devDefaults} />)

      const banner = screen.getByTestId('dev-mode-banner')
      expect(banner).toHaveAttribute('aria-live', 'polite')
    })

    it('should have hidden icon with aria-hidden="true"', () => {
      render(<DevModeBanner devDefaults={devDefaults} />)

      const svg = document.querySelector('svg')
      expect(svg).toHaveAttribute('aria-hidden', 'true')
    })

    it('should have proper data-testid for testing', () => {
      render(<DevModeBanner devDefaults={devDefaults} />)

      expect(screen.getByTestId('dev-mode-banner')).toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    const devDefaults = {
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
    }

    it('should have amber border styling', () => {
      render(<DevModeBanner devDefaults={devDefaults} />)

      const banner = screen.getByTestId('dev-mode-banner')
      expect(banner).toHaveClass('border-amber-500/50')
    })

    it('should have amber background styling', () => {
      render(<DevModeBanner devDefaults={devDefaults} />)

      const banner = screen.getByTestId('dev-mode-banner')
      expect(banner).toHaveClass('bg-amber-900/20')
    })

    it('should have rounded corners', () => {
      render(<DevModeBanner devDefaults={devDefaults} />)

      const banner = screen.getByTestId('dev-mode-banner')
      expect(banner).toHaveClass('rounded-lg')
    })

    it('should have proper margin bottom', () => {
      render(<DevModeBanner devDefaults={devDefaults} />)

      const banner = screen.getByTestId('dev-mode-banner')
      expect(banner).toHaveClass('mb-6')
    })

    it('should have warning icon with amber color', () => {
      render(<DevModeBanner devDefaults={devDefaults} />)

      const svg = document.querySelector('svg')
      expect(svg).toHaveClass('text-amber-400')
    })

    it('should have flex layout for content', () => {
      const { container } = render(<DevModeBanner devDefaults={devDefaults} />)

      const flexContainer = container.querySelector('.flex.items-start')
      expect(flexContainer).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle devDefaults with all null service values but isDevMode true', () => {
      const devDefaults = {
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
      }

      render(<DevModeBanner devDefaults={devDefaults} />)

      expect(screen.getByTestId('dev-mode-banner')).toBeInTheDocument()
    })

    it('should handle devDefaults with services populated', () => {
      const devDefaults = {
        plex: { name: 'Plex', url: 'http://localhost:32400', token: 'token' },
        tautulli: { name: 'Tautulli', url: 'http://localhost:8181', apiKey: 'key' },
        overseerr: { name: 'Overseerr', url: 'http://localhost:5055', apiKey: 'key' },
        sonarr: { name: 'Sonarr', url: 'http://localhost:8989', apiKey: 'key' },
        radarr: { name: 'Radarr', url: 'http://localhost:7878', apiKey: 'key' },
        discord: {
          isEnabled: true,
          clientId: 'id',
          clientSecret: 'secret',
        },
        chatLlmProvider: { provider: 'openai' as const, apiKey: 'key' },
        wrappedLlmProvider: { provider: 'openai' as const, apiKey: 'key' },
        llmProvider: { provider: 'openai' as const, apiKey: 'key' },
        isDevMode: true,
        autoSubmit: true,
      }

      render(<DevModeBanner devDefaults={devDefaults} />)

      expect(screen.getByTestId('dev-mode-banner')).toBeInTheDocument()
      expect(screen.getByText(/auto-submit is enabled/i)).toBeInTheDocument()
    })
  })
})
