import { render, screen } from '@testing-library/react'
import { ServiceStatusGrid } from '../service-status-grid'
import type { ServiceStatus } from '@/actions/admin'

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>
  }
})

describe('ServiceStatusGrid', () => {
  const mockServices: {
    plex: ServiceStatus
    tautulli: ServiceStatus
    overseerr: ServiceStatus
    sonarr: ServiceStatus
    radarr: ServiceStatus
    discord: ServiceStatus
    llm: ServiceStatus
  } = {
    plex: { configured: true, name: 'Plex', description: 'Media server' },
    tautulli: { configured: true, name: 'Tautulli', description: 'Plex monitoring' },
    overseerr: { configured: false, name: 'Overseerr', description: 'Request management' },
    sonarr: { configured: true, name: 'Sonarr', description: 'TV show management' },
    radarr: { configured: false, name: 'Radarr', description: 'Movie management' },
    discord: { configured: false, name: 'Discord', description: 'Bot integration' },
    llm: { configured: true, name: 'LLM Provider', description: 'AI generation' },
  }

  describe('Rendering', () => {
    it('should render the service status grid', () => {
      render(<ServiceStatusGrid services={mockServices} />)

      expect(screen.getByTestId('service-status-grid')).toBeInTheDocument()
    })

    it('should display the "Service Status" heading', () => {
      render(<ServiceStatusGrid services={mockServices} />)

      expect(screen.getByText('Service Status')).toBeInTheDocument()
    })

    it('should display configured count correctly', () => {
      render(<ServiceStatusGrid services={mockServices} />)

      // 4 configured out of 7
      expect(screen.getByText('4 of 7 configured')).toBeInTheDocument()
    })

    it('should render all service cards', () => {
      render(<ServiceStatusGrid services={mockServices} />)

      expect(screen.getByTestId('service-status-plex')).toBeInTheDocument()
      expect(screen.getByTestId('service-status-tautulli')).toBeInTheDocument()
      expect(screen.getByTestId('service-status-overseerr')).toBeInTheDocument()
      expect(screen.getByTestId('service-status-sonarr')).toBeInTheDocument()
      expect(screen.getByTestId('service-status-radarr')).toBeInTheDocument()
      expect(screen.getByTestId('service-status-discord')).toBeInTheDocument()
      expect(screen.getByTestId('service-status-llm')).toBeInTheDocument()
    })

    it('should display service names', () => {
      render(<ServiceStatusGrid services={mockServices} />)

      expect(screen.getByText('Plex')).toBeInTheDocument()
      expect(screen.getByText('Tautulli')).toBeInTheDocument()
      expect(screen.getByText('Overseerr')).toBeInTheDocument()
      expect(screen.getByText('Sonarr')).toBeInTheDocument()
      expect(screen.getByText('Radarr')).toBeInTheDocument()
      expect(screen.getByText('Discord')).toBeInTheDocument()
      expect(screen.getByText('LLM Provider')).toBeInTheDocument()
    })

    it('should display service descriptions', () => {
      render(<ServiceStatusGrid services={mockServices} />)

      expect(screen.getByText('Media server')).toBeInTheDocument()
      expect(screen.getByText('Plex monitoring')).toBeInTheDocument()
      expect(screen.getByText('Request management')).toBeInTheDocument()
      expect(screen.getByText('TV show management')).toBeInTheDocument()
      expect(screen.getByText('Movie management')).toBeInTheDocument()
      expect(screen.getByText('Bot integration')).toBeInTheDocument()
      expect(screen.getByText('AI generation')).toBeInTheDocument()
    })
  })

  describe('Configuration Status', () => {
    it('should show configure link for unconfigured services', () => {
      render(<ServiceStatusGrid services={mockServices} />)

      // Unconfigured services should have Configure links
      const configureLinks = screen.getAllByText('Configure')
      expect(configureLinks).toHaveLength(3) // overseerr, radarr, discord
    })

    it('should not show configure link for configured services', () => {
      const allConfigured = {
        plex: { configured: true, name: 'Plex', description: 'Media server' },
        tautulli: { configured: true, name: 'Tautulli', description: 'Plex monitoring' },
        overseerr: { configured: true, name: 'Overseerr', description: 'Request management' },
        sonarr: { configured: true, name: 'Sonarr', description: 'TV show management' },
        radarr: { configured: true, name: 'Radarr', description: 'Movie management' },
        discord: { configured: true, name: 'Discord', description: 'Bot integration' },
        llm: { configured: true, name: 'LLM Provider', description: 'AI generation' },
      }

      render(<ServiceStatusGrid services={allConfigured} />)

      expect(screen.queryByText('Configure')).not.toBeInTheDocument()
    })

    it('should show all services unconfigured', () => {
      const noneConfigured = {
        plex: { configured: false, name: 'Plex', description: 'Media server' },
        tautulli: { configured: false, name: 'Tautulli', description: 'Plex monitoring' },
        overseerr: { configured: false, name: 'Overseerr', description: 'Request management' },
        sonarr: { configured: false, name: 'Sonarr', description: 'TV show management' },
        radarr: { configured: false, name: 'Radarr', description: 'Movie management' },
        discord: { configured: false, name: 'Discord', description: 'Bot integration' },
        llm: { configured: false, name: 'LLM Provider', description: 'AI generation' },
      }

      render(<ServiceStatusGrid services={noneConfigured} />)

      expect(screen.getByText('0 of 7 configured')).toBeInTheDocument()
      expect(screen.getAllByText('Configure')).toHaveLength(7)
    })

    it('should show 7 of 7 configured when all services are configured', () => {
      const allConfigured = {
        plex: { configured: true, name: 'Plex', description: 'Media server' },
        tautulli: { configured: true, name: 'Tautulli', description: 'Plex monitoring' },
        overseerr: { configured: true, name: 'Overseerr', description: 'Request management' },
        sonarr: { configured: true, name: 'Sonarr', description: 'TV show management' },
        radarr: { configured: true, name: 'Radarr', description: 'Movie management' },
        discord: { configured: true, name: 'Discord', description: 'Bot integration' },
        llm: { configured: true, name: 'LLM Provider', description: 'AI generation' },
      }

      render(<ServiceStatusGrid services={allConfigured} />)

      expect(screen.getByText('7 of 7 configured')).toBeInTheDocument()
    })
  })

  describe('Links', () => {
    it('should link configure buttons to /admin/settings', () => {
      render(<ServiceStatusGrid services={mockServices} />)

      const configureLinks = screen.getAllByText('Configure')
      configureLinks.forEach(link => {
        expect(link.closest('a')).toHaveAttribute('href', '/admin/settings')
      })
    })
  })
})
