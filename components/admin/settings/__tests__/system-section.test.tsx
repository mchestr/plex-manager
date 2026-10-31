/**
 * The System information section: what the process and its database report,
 * read-only. The server time zone has its own section (time-zone-section).
 */

import { render, screen } from '@testing-library/react'

import { SystemSection } from '@/components/admin/settings/sections/system-section'

const RUNTIME = {
  baseUrl: 'https://plex.example.com',
  appVersion: '1.2.3 (abc1234)',
  nodeEnv: 'production',
  nodeVersion: 'v24.1.0',
  databaseProvider: 'PostgreSQL',
  databaseUrl: 'postgresql://***@db:5432/plex',
  platform: 'Linux',
  configUpdated: 'Never',
}

describe('SystemSection', () => {
  it('shows the runtime facts', () => {
    render(<SystemSection {...RUNTIME} />)

    expect(screen.getByRole('region', { name: 'System information' })).toHaveAttribute('id', 'system')
    expect(screen.getByTestId('settings-app-version')).toHaveTextContent('1.2.3 (abc1234)')
    expect(screen.getByTestId('settings-config-updated-timestamp')).toHaveTextContent('Never')
    expect(screen.getByTestId('settings-system-section')).toHaveTextContent('postgresql://***@db:5432/plex')
  })

  it('has nothing to edit: no Edit, form or time zone', () => {
    render(<SystemSection {...RUNTIME} />)

    expect(screen.queryByTestId('settings-system-edit')).not.toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(screen.queryByTestId('server-time-zone-select')).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-system-section')).not.toHaveTextContent(/time zone/i)
  })
})
