/**
 * The Rewind switch, the month-day season window and the server time zone
 * (P2.2, GAP-40): getWrappedSettings, updateWrappedSettings and
 * updateServerTimeZone.
 */

import { getWrappedSettings, updateServerTimeZone, updateWrappedSettings } from '@/actions/admin'
import { requireAdmin } from '@/lib/admin'
import { getServerSession } from 'next-auth'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
}))

// `@/actions/admin` also exports actions built on the action helper, which reads the session
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  })),
}))

const mockRevalidatePath = jest.fn()
const mockUpdateTag = jest.fn()
jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
  updateTag: (...args: unknown[]) => mockUpdateTag(...args),
  unstable_cache: (fn: unknown) => fn,
}))

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>
const mockFindUnique = prismaMock.config.findUnique as jest.Mock
const mockUpsert = prismaMock.config.upsert as jest.Mock

const mockAdminSession = {
  user: { id: 'admin-user-id', email: 'admin@example.com', name: 'Admin User', isAdmin: true },
  expires: '2099-01-01T00:00:00.000Z',
}

/** One Config row answers the switch, the window and the zone reads. */
function storedConfig(row: { wrappedEnabled?: boolean; opens?: string; closes?: string; timezone?: string | null } | null) {
  mockFindUnique.mockResolvedValue(
    row && {
      wrappedEnabled: row.wrappedEnabled ?? true,
      rewindSeasonOpens: row.opens ?? '12-01',
      rewindSeasonCloses: row.closes ?? '01-31',
      timezone: row.timezone ?? null,
    },
  )
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  mockRequireAdmin.mockResolvedValue(mockAdminSession)
  ;(getServerSession as jest.Mock).mockResolvedValue(mockAdminSession)
})

describe('getWrappedSettings', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('uses the default window when no config exists: closed in October', async () => {
    jest.setSystemTime(new Date('2026-10-18T12:00:00Z'))
    storedConfig(null)

    await expect(getWrappedSettings()).resolves.toEqual({
      featureEnabled: true,
      seasonOpen: false,
      wrappedEnabled: false,
      wrappedYear: 2026,
    })
  })

  it('is open on 2 January for the season that opened in December', async () => {
    jest.setSystemTime(new Date('2027-01-02T12:00:00Z'))
    storedConfig({})

    await expect(getWrappedSettings()).resolves.toEqual({
      featureEnabled: true,
      seasonOpen: true,
      wrappedEnabled: true,
      wrappedYear: 2026,
    })
  })

  it('evaluates the window in the server zone', async () => {
    // 23:30 UTC on 30 November is 00:30 on 1 December in Berlin
    jest.setSystemTime(new Date('2026-11-30T23:30:00Z'))
    storedConfig({ timezone: 'Europe/Berlin' })
    await expect(getWrappedSettings()).resolves.toMatchObject({ wrappedEnabled: true, wrappedYear: 2026 })

    storedConfig({ timezone: 'UTC' })
    await expect(getWrappedSettings()).resolves.toMatchObject({ wrappedEnabled: false, wrappedYear: 2026 })
  })

  it('a feature switched off disables generation inside the window', async () => {
    jest.setSystemTime(new Date('2026-12-15T12:00:00Z'))
    storedConfig({ wrappedEnabled: false })

    await expect(getWrappedSettings()).resolves.toEqual({
      featureEnabled: false,
      seasonOpen: true,
      wrappedEnabled: false,
      wrappedYear: 2026,
    })
  })

  it('a window within one year belongs to the calendar year', async () => {
    jest.setSystemTime(new Date('2026-11-25T12:00:00Z'))
    storedConfig({ opens: '11-20', closes: '12-31' })

    await expect(getWrappedSettings()).resolves.toMatchObject({ wrappedEnabled: true, wrappedYear: 2026 })
  })

  it('falls back to the default window in UTC on a database error', async () => {
    jest.setSystemTime(new Date('2027-01-02T12:00:00Z'))
    mockFindUnique.mockRejectedValue(new Error('Database error'))

    await expect(getWrappedSettings()).resolves.toEqual({
      featureEnabled: true,
      seasonOpen: true,
      wrappedEnabled: true,
      wrappedYear: 2026,
    })
  })
})

describe('updateWrappedSettings', () => {
  const saved = { wrappedEnabled: true, rewindSeasonOpens: '12-01', rewindSeasonCloses: '01-31', updatedBy: 'admin-user-id' }

  it('stores the month-day window and the switch, and audits the change', async () => {
    mockFindUnique.mockResolvedValue({ wrappedEnabled: false, rewindSeasonOpens: '12-01', rewindSeasonCloses: '01-15' })
    mockUpsert.mockResolvedValue({ id: 'config', ...saved })

    const result = await updateWrappedSettings({ enabled: true, opens: '12-01', closes: '01-31' })

    expect(result).toEqual({ success: true, data: null })
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { id: 'config' },
      update: saved,
      create: { id: 'config', llmDisabled: false, ...saved },
      select: { id: true },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.CONFIG_CHANGED, 'admin-user-id', {
      section: 'rewind.season',
      changedFields: ['rewindSeasonCloses', 'wrappedEnabled'],
      secretChanged: false,
      origins: { before: {}, after: {} },
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/rewind', 'layout')
  })

  it('accepts a window within one year and 29 February', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockUpsert.mockResolvedValue({ id: 'config' })

    await expect(updateWrappedSettings({ enabled: false, opens: '11-20', closes: '02-29' })).resolves.toMatchObject({
      success: true,
    })
  })

  it('rejects the same day for opening and closing', async () => {
    const result = await updateWrappedSettings({ enabled: true, opens: '12-01', closes: '12-01' })

    expect(result).toMatchObject({
      success: false,
      code: 'VALIDATION',
      error: 'The season cannot open and close on the same day',
    })
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it.each([
    ['02-30', '01-31'],
    ['12-01', '13-01'],
    ['2026-12-01', '01-31'],
    ['', '01-31'],
  ])('rejects %p to %p', async (opens, closes) => {
    const result = await updateWrappedSettings({ enabled: true, opens, closes })

    expect(result).toMatchObject({
      success: false,
      code: 'VALIDATION',
      error: 'Season dates must be real month-day values (MM-DD)',
    })
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('requires an admin', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({ ...mockAdminSession, user: { ...mockAdminSession.user, isAdmin: false } })

    await expect(updateWrappedSettings({ enabled: true, opens: '12-01', closes: '01-31' })).resolves.toMatchObject({
      success: false,
      code: 'FORBIDDEN',
    })
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns fixed copy for database errors', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockUpsert.mockRejectedValue(new Error('Database error'))

    await expect(updateWrappedSettings({ enabled: true, opens: '12-01', closes: '01-31' })).resolves.toEqual({
      success: false,
      code: 'INTERNAL',
      error: 'Failed to update wrapped settings',
    })
  })
})

describe('updateServerTimeZone', () => {
  it('stores the canonical name, audits the change and revalidates every page', async () => {
    mockFindUnique.mockResolvedValue({ timezone: 'UTC' })
    mockUpsert.mockResolvedValue({ id: 'config' })

    await expect(updateServerTimeZone('US/Pacific')).resolves.toEqual({
      success: true,
      timezone: 'America/Los_Angeles',
    })
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { id: 'config' },
      update: { timezone: 'America/Los_Angeles', updatedBy: 'admin-user-id' },
      create: { id: 'config', timezone: 'America/Los_Angeles', updatedBy: 'admin-user-id' },
      select: { id: true },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.SERVER_TIMEZONE_CHANGED, 'admin-user-id', {
      from: 'UTC',
      to: 'America/Los_Angeles',
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/', 'layout')
    // The cached format settings (lib/settings/app-settings.ts) pick up the new zone.
    expect(mockUpdateTag).toHaveBeenCalledWith('app-settings')
  })

  it('accepts UTC, which Intl.supportedValuesOf leaves out', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockUpsert.mockResolvedValue({ id: 'config' })

    await expect(updateServerTimeZone('Etc/UTC')).resolves.toEqual({ success: true, timezone: 'UTC' })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.SERVER_TIMEZONE_CHANGED, 'admin-user-id', {
      from: null,
      to: 'UTC',
    })
  })

  it.each(['Mars/Base', '', '+05:00', 'x'.repeat(65)])('rejects %p', async (zone) => {
    await expect(updateServerTimeZone(zone)).resolves.toMatchObject({ success: false })
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it('requires an admin', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('Not admin'))

    await expect(updateServerTimeZone('Europe/Berlin')).rejects.toThrow('Not admin')
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
