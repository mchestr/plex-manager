/**
 * The Request limits page, the Request limits tab of Automations (moved from
 * the Members group of `/admin/settings`): its own admin check before any
 * read, per request, then the Request limits section with the saved tiers,
 * the last run's start in the server zone and "Last saved" after a first save.
 */

import { render, screen } from '@testing-library/react'
import { connection } from 'next/server'

import RequestLimitsPage, { metadata } from '@/app/admin/(automations)/request-limits/page'
import type { RequestTiersSection } from '@/components/admin/settings/sections/request-tiers-section'
import { assertAdmin } from '@/lib/admin'
import { getRequestTierSettings, type RequestTierSettingsData } from '@/lib/data/community-stats'
import { DEFAULT_TIERS } from '@/lib/request-tiers/tiers'
import { getSettingsAuditMeta, type SettingsAuditMeta } from '@/lib/settings/audit-meta'

type SectionProps = React.ComponentProps<typeof RequestTiersSection>

jest.mock('next/server', () => ({ connection: jest.fn() }))
jest.mock('@/lib/admin', () => ({ assertAdmin: jest.fn() }))
jest.mock('@/lib/data/community-stats', () => ({ getRequestTierSettings: jest.fn() }))
jest.mock('@/lib/settings/audit-meta', () => ({ getSettingsAuditMeta: jest.fn() }))
jest.mock('@/lib/settings/app-settings', () => ({
  getFormat: async () => (await import('@/lib/utils/format')).bindFormat({ timeZone: 'America/Chicago', locale: 'en-US' }),
}))
jest.mock('@/components/admin/settings/last-saved', () => ({
  LastSaved: ({ id }: { id: string }) => <p data-testid={`last-saved-${id}`}>Last saved</p>,
}))
// The section has its own tests; the page's job is to hand it the right data
jest.mock('@/components/admin/settings/sections/request-tiers-section', () => ({
  RequestTiersSection: ({ saved, startedLabel, footerMeta }: SectionProps) => (
    <section aria-label="Request limits" data-testid="settings-request-tiers-section">
      <p data-testid="stub-enabled">{String(saved.enabled)}</p>
      <p data-testid="stub-tiers">{saved.tiers.length}</p>
      <p data-testid="stub-started">{startedLabel ?? 'none'}</p>
      {footerMeta}
    </section>
  ),
}))

const SAVED: RequestTierSettingsData = { enabled: true, runHour: 3, tiers: [...DEFAULT_TIERS], lastRun: null }

const NEVER_SAVED = {
  plex: null,
  tautulli: null,
  overseerr: null,
  ai: null,
  judge: null,
  discord: null,
  stripe: null,
  channelStats: null,
  requestTiers: null,
  rewind: null,
  other: null,
  timeZone: null,
} satisfies SettingsAuditMeta

async function renderPage() {
  render(await RequestLimitsPage())
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(assertAdmin).mockResolvedValue({ user: { id: 'admin-1', isAdmin: true }, expires: '' } as never)
  jest.mocked(getRequestTierSettings).mockResolvedValue(SAVED)
  jest.mocked(getSettingsAuditMeta).mockResolvedValue(NEVER_SAVED)
})

describe('Request limits page', () => {
  it('is titled Request limits', () => {
    expect(metadata.title).toBe('Request limits')
  })

  it('checks for an admin before reading anything', async () => {
    jest.mocked(assertAdmin).mockRejectedValue(Object.assign(new Error('Admin access required'), { digest: 'PM_FORBIDDEN' }))

    await expect(RequestLimitsPage()).rejects.toMatchObject({ digest: 'PM_FORBIDDEN' })
    expect(getRequestTierSettings).not.toHaveBeenCalled()
    expect(getSettingsAuditMeta).not.toHaveBeenCalled()
  })

  it('renders per request, under its header, with the saved settings and no last run', async () => {
    await renderPage()

    expect(connection).toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: 'Request limits' })).toBeInTheDocument()
    expect(screen.getByTestId('admin-request-limits-header')).toBeInTheDocument()
    expect(screen.getByTestId('stub-enabled')).toHaveTextContent('true')
    expect(screen.getByTestId('stub-tiers')).toHaveTextContent(String(DEFAULT_TIERS.length))
    expect(screen.getByTestId('stub-started')).toHaveTextContent('none')
  })

  it("labels the last run's start in the server zone", async () => {
    jest.mocked(getRequestTierSettings).mockResolvedValue({
      ...SAVED,
      lastRun: {
        startedAt: new Date('2026-10-31T08:00:00Z'),
        finishedAt: new Date('2026-10-31T08:01:00Z'),
        trigger: 'scheduled',
        updated: 2,
        unchanged: 5,
        failed: 0,
        skipped: 1,
        error: null,
        entries: [],
      },
    })

    await renderPage()

    expect(screen.getByTestId('stub-started')).toHaveTextContent('Oct 31, 2026, 3:00 AM CDT')
  })

  it('says who saved last, and leaves the footer out before a first save', async () => {
    await renderPage()
    expect(screen.queryByTestId('last-saved-requestTiers')).not.toBeInTheDocument()

    jest.mocked(getSettingsAuditMeta).mockResolvedValue({ ...NEVER_SAVED, requestTiers: { at: new Date(), by: 'Dana Whitfield' } })
    await renderPage()
    expect(screen.getByTestId('last-saved-requestTiers')).toBeInTheDocument()
  })
})
