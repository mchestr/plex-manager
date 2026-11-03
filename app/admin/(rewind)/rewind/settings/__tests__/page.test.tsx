/**
 * The Rewind settings page: its own admin check before any read, then the
 * Rewind settings section with the saved settings and the live checks, and the
 * note on when the season's data was last prepared.
 */

import { render, screen, within } from '@testing-library/react'
import { connection } from 'next/server'

import { buildConfig } from '@/__tests__/helpers/factories'
import RewindSettingsPage from '@/app/admin/(rewind)/rewind/settings/page'
import type { RewindSettingsSection } from '@/components/admin/settings/rewind-settings-section'
import { assertAdmin } from '@/lib/admin'
import { getAdminSettings } from '@/lib/data/admin-settings'
import { getRewindSeasonDataPreparedAt } from '@/lib/data/rewind-season'
import { getRewindSeasonSpend } from '@/lib/llm/usage-totals'
import { checkRewindInfra } from '@/lib/queue/rewind-infra'
import { getSettingsAuditMeta } from '@/lib/settings/audit-meta'
import { getSettingsHealth } from '@/lib/settings/connection-health'
import { serverZone } from '@/lib/utils/server-zone'
import { getRewindContentRatings, getRewindLibraries } from '@/lib/wrapped/admin/settings-options'
import { getSeasonState } from '@/lib/wrapped/season'

type SectionProps = React.ComponentProps<typeof RewindSettingsSection>

jest.mock('next/server', () => ({ connection: jest.fn() }))
// The real Link prefetches on an IntersectionObserver timer, outside act().
jest.mock('next/link', () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<'a'>) => <a href={href} {...props} />
  return MockLink
})
jest.mock('@/lib/admin', () => ({ assertAdmin: jest.fn() }))
jest.mock('@/lib/data/admin-settings', () => ({ getAdminSettings: jest.fn() }))
jest.mock('@/lib/data/rewind-season', () => ({ getRewindSeasonDataPreparedAt: jest.fn() }))
jest.mock('@/lib/llm/usage-totals', () => ({ getRewindSeasonSpend: jest.fn() }))
jest.mock('@/lib/queue/rewind-infra', () => ({ checkRewindInfra: jest.fn() }))
jest.mock('@/lib/settings/audit-meta', () => ({ getSettingsAuditMeta: jest.fn() }))
jest.mock('@/lib/settings/connection-health', () => ({ getSettingsHealth: jest.fn() }))
jest.mock('@/lib/settings/app-settings', () => ({
  getFormat: async () => (await import('@/lib/utils/format')).bindFormat({ timeZone: 'America/Chicago', locale: 'en-US' }),
}))
jest.mock('@/lib/utils/server-zone', () => ({ serverZone: jest.fn() }))
jest.mock('@/lib/wrapped/admin/settings-options', () => ({ getRewindLibraries: jest.fn(), getRewindContentRatings: jest.fn() }))
jest.mock('@/lib/wrapped/season', () => ({ getSeasonState: jest.fn() }))
jest.mock('@/components/admin/settings/last-saved', () => ({
  LastSaved: ({ id }: { id: string }) => <p data-testid={`last-saved-${id}`}>Last saved</p>,
}))
// The section has its own tests; the page's job is to hand it the right data
jest.mock('@/components/admin/settings/rewind-settings-section', () => ({
  RewindSettingsSection: ({ saved, zone, spent, libraries, ratings, status, footerMeta, children }: SectionProps) => (
    <section aria-label="Rewind" data-testid="settings-rewind-section">
      <p data-testid="stub-audience">{saved.rewindAudience}</p>
      <p data-testid="stub-zone">{zone}</p>
      <p data-testid="stub-spent">{spent}</p>
      <p data-testid="stub-libraries">{libraries?.map((library) => library.name).join(', ')}</p>
      <p data-testid="stub-ratings">{ratings.join(', ')}</p>
      <p data-testid="stub-redis">{status.redis ?? 'ok'}</p>
      <p data-testid="stub-tautulli">{status.tautulli}</p>
      {footerMeta}
      {children}
    </section>
  ),
}))

async function renderPage() {
  render(await RewindSettingsPage())
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(assertAdmin).mockResolvedValue({ user: { id: 'admin-1', isAdmin: true }, expires: '' } as never)
  jest.mocked(getAdminSettings).mockResolvedValue({
    config: buildConfig({ rewindAudience: 'admins', llmDisabled: false }),
    discordIntegration: null,
  } as never)
  jest.mocked(getSettingsHealth).mockResolvedValue({ rewind: { status: 'ok', code: null, checkedAt: null } } as never)
  jest.mocked(getSeasonState).mockResolvedValue({ seasonYear: 2026 } as never)
  jest.mocked(serverZone).mockResolvedValue('America/Chicago')
  jest.mocked(getRewindSeasonDataPreparedAt).mockResolvedValue(null)
  jest.mocked(checkRewindInfra).mockResolvedValue({ ok: true })
  jest.mocked(getRewindLibraries).mockResolvedValue({ status: 'connected', libraries: [{ id: '1', name: 'Movies' }, { id: '2', name: 'Shows' }] })
  jest.mocked(getRewindContentRatings).mockResolvedValue(['PG', 'R'])
  jest.mocked(getRewindSeasonSpend).mockResolvedValue(1.5)
  jest.mocked(getSettingsAuditMeta).mockResolvedValue({ rewind: null } as never)
})

describe('Rewind settings page', () => {
  it('checks for an admin before reading anything', async () => {
    jest.mocked(assertAdmin).mockRejectedValue(Object.assign(new Error('Admin access required'), { digest: 'PM_FORBIDDEN' }))

    await expect(RewindSettingsPage()).rejects.toMatchObject({ digest: 'PM_FORBIDDEN' })

    expect(connection).not.toHaveBeenCalled()
    expect(getAdminSettings).not.toHaveBeenCalled()
    expect(getSettingsHealth).not.toHaveBeenCalled()
    expect(getRewindLibraries).not.toHaveBeenCalled()
  })

  it('renders per request, under a header, and hands the section the saved settings and the live checks', async () => {
    jest.mocked(checkRewindInfra).mockResolvedValue({ ok: false, code: 'REDIS_NOT_CONFIGURED' })
    jest.mocked(getRewindLibraries).mockResolvedValue({ status: 'unreachable', libraries: null })

    await renderPage()

    expect(connection).toHaveBeenCalled()
    expect(within(screen.getByTestId('admin-rewind-settings-header')).getByRole('heading', { level: 1, name: 'Rewind settings' })).toBeInTheDocument()
    expect(screen.getByTestId('stub-audience')).toHaveTextContent('admins')
    expect(screen.getByTestId('stub-zone')).toHaveTextContent('America/Chicago')
    expect(screen.getByTestId('stub-ratings')).toHaveTextContent('PG, R')
    expect(getRewindSeasonSpend).toHaveBeenCalledWith(2026)
    expect(screen.getByTestId('stub-redis')).not.toHaveTextContent(/^ok$/)
    expect(screen.getByTestId('stub-tautulli')).toHaveTextContent('unreachable')
  })

  it('lists the libraries and shows Last saved only after a first save', async () => {
    await renderPage()

    expect(screen.getByTestId('stub-libraries')).toHaveTextContent('Movies, Shows')
    expect(screen.getByTestId('stub-redis')).toHaveTextContent('ok')
    expect(screen.queryByTestId('last-saved-rewind')).not.toBeInTheDocument()

    jest.mocked(getSettingsAuditMeta).mockResolvedValue({ rewind: { at: new Date('2026-10-20T12:00:00Z'), by: 'Ana', eventId: 'audit-1' } } as never)
    await renderPage()

    expect(screen.getByTestId('last-saved-rewind')).toBeInTheDocument()
  })

  it('says when the season data was last prepared, or that it was not, and links to the Season page', async () => {
    await renderPage()

    const note = screen.getByTestId('rewind-season-data-prepared-at')
    expect(note).toHaveTextContent('Season data not prepared yet.')
    expect(screen.getByTestId('rewind-season-console-link')).toHaveAttribute('href', '/admin/rewind')

    jest.mocked(getRewindSeasonDataPreparedAt).mockResolvedValue('2026-10-20T12:00:00.000Z')
    await renderPage()

    expect(screen.getAllByTestId('rewind-season-data-prepared-at')[1]).toHaveTextContent(/Season data last prepared .*2026/)
  })
})
