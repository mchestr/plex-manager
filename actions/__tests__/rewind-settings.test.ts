/**
 * @jest-environment node
 */

/**
 * updateRewindSettings (P7.12): admin only, writes only the changed fields,
 * one CONFIG_CHANGED entry with a field-level diff, the known-list checks,
 * and the flags reaching getConfig().
 */

import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getConfig } from '@/actions/admin/admin-config'
import { updateRewindSettings } from '@/actions/admin/rewind-settings'
import { Prisma } from '@/lib/generated/prisma/client'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'
import type { RewindSettingsInput } from '@/lib/validations/rewind-settings'
import { getRewindContentRatings, getRewindLibraries } from '@/lib/wrapped/admin/settings-options'
import { scheduleSeasonOpenRun } from '@/lib/rewind/season-runs'
import type { RewindSettingsRow } from '@/lib/wrapped/config'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next/cache', () => ({ revalidatePath: jest.fn(), updateTag: jest.fn(), unstable_cache: (fn: unknown) => fn }))
jest.mock('@/lib/wrapped/admin/settings-options', () => ({
  getRewindLibraries: jest.fn(),
  getRewindContentRatings: jest.fn(),
}))
jest.mock('@/lib/rewind/season-runs', () => ({ scheduleSeasonOpenRun: jest.fn(async () => null) }))
jest.mock('@/lib/wrapped/season', () => ({ getSeasonYear: jest.fn(async () => 2026) }))
const mockAddBulk = jest.fn(async () => [])
jest.mock('@/lib/queue/rewind-producers', () => ({ getRewindQueue: jest.fn(() => ({ add: jest.fn(), addBulk: mockAddBulk })) }))
jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
}))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const admin = { user: { id: 'admin-1', isAdmin: true }, expires: '2099-01-01T00:00:00.000Z' }
const member = { user: { id: 'member-1', isAdmin: false }, expires: '2099-01-01T00:00:00.000Z' }

const stored: RewindSettingsRow = {
  rewindEnabled: false,
  rewindAudience: 'admins',
  rewindSeasonOpens: '12-01',
  rewindSeasonCloses: '01-31',
  rewindLlmMode: 'standard',
  rewindLlmBudgetUsd: new Prisma.Decimal(10),
  rewindPublicLinks: true,
  rewindPublicCounts: false,
  rewindShowServerNameOnCards: true,
  rewindAllowArtOnCards: true,
  rewindExcludedSectionIds: ['3'],
  rewindExcludedContentRatings: null,
  rewindIncludeManagedUsers: false,
  rewindDisabledPages: null,
  rewindNotifyChannels: ['discord', 'banner'],
}

const unchanged: RewindSettingsInput = {
  rewindEnabled: false,
  rewindAudience: 'admins',
  rewindSeasonOpens: '12-01',
  rewindSeasonCloses: '01-31',
  rewindLlmMode: 'standard',
  rewindLlmBudgetUsd: 10,
  rewindPublicLinks: true,
  rewindPublicCounts: false,
  rewindShowServerNameOnCards: true,
  rewindAllowArtOnCards: true,
  rewindExcludedSectionIds: ['3'],
  rewindExcludedContentRatings: [],
  rewindIncludeManagedUsers: false,
  rewindDisabledPages: [],
  rewindNotifyChannels: ['discord', 'banner'],
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue(admin)
  // The mock's overloads type findUnique by its select; the test hands back the selected row
  prismaMock.config.findUnique.mockResolvedValue(stored as never)
  prismaMock.config.upsert.mockResolvedValue({ id: 'config' } as never)
  jest.mocked(getRewindLibraries).mockResolvedValue({ status: 'connected', libraries: [{ id: '1', name: 'Films' }, { id: '2', name: 'Shows' }] })
  jest.mocked(getRewindContentRatings).mockResolvedValue(['PG', 'R', 'TV-MA'])
})

describe('updateRewindSettings', () => {
  it('refuses non-admins without reading or writing', async () => {
    jest.mocked(getServerSession).mockResolvedValue(member)

    await expect(updateRewindSettings(unchanged)).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
    expect(prismaMock.config.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
  })

  it('writes only the changed fields and logs one CONFIG_CHANGED entry listing them', async () => {
    const result = await updateRewindSettings({
      ...unchanged,
      rewindEnabled: true,
      rewindLlmBudgetUsd: 5,
      rewindDisabledPages: ['people'],
    })

    expect(result).toEqual({ success: true, data: null })
    expect(prismaMock.config.upsert).toHaveBeenCalledWith({
      where: { id: 'config' },
      update: { rewindEnabled: true, rewindLlmBudgetUsd: 5, rewindDisabledPages: ['people'], updatedBy: 'admin-1' },
      create: { id: 'config', rewindEnabled: true, rewindLlmBudgetUsd: 5, rewindDisabledPages: ['people'], updatedBy: 'admin-1' },
      select: { id: true },
    })
    expect(logAuditEvent).toHaveBeenCalledTimes(1)
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.CONFIG_CHANGED, 'admin-1', {
      section: 'rewind',
      changedFields: ['rewindDisabledPages', 'rewindEnabled', 'rewindLlmBudgetUsd'],
      secretChanged: false,
      origins: { before: {}, after: {} },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/settings')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/rewind')
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })

  it('writes and logs nothing when nothing changed', async () => {
    await expect(updateRewindSettings(unchanged)).resolves.toEqual({ success: true, data: null })
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it('records a season date change', async () => {
    await updateRewindSettings({ ...unchanged, rewindSeasonOpens: '11-25' })

    expect(prismaMock.config.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { rewindSeasonOpens: '11-25', updatedBy: 'admin-1' } })
    )
    expect(logAuditEvent).toHaveBeenCalledWith(
      AuditEventType.CONFIG_CHANGED,
      'admin-1',
      expect.objectContaining({ changedFields: ['rewindSeasonOpens'] })
    )
  })

  it('a date change reschedules Prepare (P7.8), and other changes do not', async () => {
    await updateRewindSettings({ ...unchanged, rewindSeasonOpens: '11-25' })
    expect(scheduleSeasonOpenRun).toHaveBeenCalledTimes(1)

    jest.mocked(scheduleSeasonOpenRun).mockClear()
    await updateRewindSettings({ ...unchanged, rewindEnabled: true })
    expect(scheduleSeasonOpenRun).not.toHaveBeenCalled()
  })

  it('saves a date change while the reschedule fails', async () => {
    jest.mocked(scheduleSeasonOpenRun).mockRejectedValueOnce(new Error('Redis down'))

    await expect(updateRewindSettings({ ...unchanged, rewindSeasonCloses: '01-15' })).resolves.toEqual({ success: true, data: null })
  })

  it('refuses a library Tautulli does not list, but keeps one already stored', async () => {
    await expect(updateRewindSettings({ ...unchanged, rewindExcludedSectionIds: ['3', '9'] })).resolves.toMatchObject({
      success: false,
      code: 'VALIDATION',
    })
    await expect(updateRewindSettings({ ...unchanged, rewindExcludedSectionIds: ['1', '3'] })).resolves.toMatchObject({
      success: true,
    })
  })

  it('refuses a content rating the metadata cache has not seen', async () => {
    await expect(updateRewindSettings({ ...unchanged, rewindExcludedContentRatings: ['NC-17'] })).resolves.toMatchObject({
      success: false,
      code: 'VALIDATION',
    })
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
  })

  it('refuses invalid input before reading the row', async () => {
    await expect(updateRewindSettings({ ...unchanged, rewindSeasonCloses: '02-30' })).resolves.toMatchObject({
      success: false,
      code: 'VALIDATION',
    })
    expect(prismaMock.config.findUnique).not.toHaveBeenCalled()
  })
})

describe('the season-open fan-out (P7.14)', () => {
  const live = { ...stored, rewindEnabled: true }

  beforeEach(() => {
    prismaMock.config.findUnique.mockResolvedValue(live as never)
    // Two completed season Rewinds nobody has been told about yet
    prismaMock.plexWrapped.findMany.mockResolvedValue([
      { id: 'wrapped-1', userId: 'member-1' },
      { id: 'wrapped-2', userId: 'member-2' },
    ] as never)
  })

  it('enqueues one notification per completed, un-notified member when the audience becomes everyone', async () => {
    await expect(updateRewindSettings({ ...unchanged, rewindEnabled: true, rewindAudience: 'all' })).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.plexWrapped.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { year: 2026, status: 'completed', notifiedAt: null } }))
    expect(mockAddBulk).toHaveBeenCalledTimes(1)
    expect(mockAddBulk).toHaveBeenCalledWith([
      expect.objectContaining({ data: { wrappedId: 'wrapped-1', userId: 'member-1', year: 2026, kind: 'season' }, opts: expect.objectContaining({ deduplication: { id: 'rewind:notify:2026:member-1:season' } }) }),
      expect.objectContaining({ data: { wrappedId: 'wrapped-2', userId: 'member-2', year: 2026, kind: 'season' }, opts: expect.objectContaining({ deduplication: { id: 'rewind:notify:2026:member-2:season' } }) }),
    ])
  })

  it('enqueues none when saving again', async () => {
    prismaMock.config.findUnique.mockResolvedValue({ ...live, rewindAudience: 'all' } as never)

    await updateRewindSettings({ ...unchanged, rewindEnabled: true, rewindAudience: 'all', rewindLlmBudgetUsd: 4 })

    expect(mockAddBulk).not.toHaveBeenCalled()
  })

  it('enqueues none when the audience goes back to admins', async () => {
    prismaMock.config.findUnique.mockResolvedValue({ ...live, rewindAudience: 'all' } as never)

    await updateRewindSettings({ ...unchanged, rewindEnabled: true, rewindAudience: 'admins' })

    expect(mockAddBulk).not.toHaveBeenCalled()
  })

  it('saves the switch while Redis is down', async () => {
    mockAddBulk.mockRejectedValueOnce(new Error('Redis down'))

    await expect(updateRewindSettings({ ...unchanged, rewindEnabled: true, rewindAudience: 'all' })).resolves.toEqual({ success: true, data: null })
  })
})

describe('getConfig', () => {
  it('returns the Rewind flags', async () => {
    prismaMock.config.findUnique.mockResolvedValue({ id: 'config', llmDisabled: false, ...stored, rewindAudience: 'all' } as never)

    const config = await getConfig()

    expect(config).toMatchObject({ rewindAudience: 'all', rewindNotifyChannels: ['discord', 'banner'] })
    const select = prismaMock.config.findUnique.mock.calls[0][0].select
    expect(select).toMatchObject({ rewindEnabled: true, rewindAudience: true, rewindDisabledPages: true, rewindLlmBudgetUsd: true })
  })
})
