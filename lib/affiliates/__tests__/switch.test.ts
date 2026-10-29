/** The affiliate switch: its preconditions, the Config write, and the cancel of open invites when it goes off. */

import { mockReset } from 'jest-mock-extended'

import { buildConfig, buildPlexServer } from '@/__tests__/helpers/factories'
import { asAppTransactionClient, prismaMock } from '@/__tests__/helpers/prisma-mock'
import { saveAffiliateSettings, turnOffForServerChange } from '@/lib/affiliates/switch'
import { withMachineIdentifier } from '@/lib/connections/plex-machine-id'
import { getActiveService } from '@/lib/data/active-service'
import { inSerializable } from '@/lib/db/serializable'
import type { Tautulli } from '@/lib/generated/prisma/client'
import { AuditEventType, recordAuditEvent } from '@/lib/security/audit-log'

jest.mock('server-only', () => ({}))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/db/serializable', () => ({ inSerializable: jest.fn() }))
jest.mock('@/lib/data/active-service', () => ({ getActiveService: jest.fn() }))
jest.mock('@/lib/connections/plex-machine-id', () => ({ withMachineIdentifier: jest.fn() }))
jest.mock('@/lib/security/audit-log', () => ({ ...jest.requireActual('@/lib/security/audit-log'), recordAuditEvent: jest.fn() }))

const tx = asAppTransactionClient(prismaMock)
const plex = buildPlexServer({ machineIdentifier: null })
const tautulli = { id: 't1' } as Tautulli
const input = { enabled: true, tiers: [{ overHours: 50, invites: 1 }], cap: 10, libraryIds: [1] }

const cancelled = {
  where: { kind: 'AFFILIATE', joinedAt: null, cancelledAt: null, expiresAt: { gt: expect.any(Date) } },
  data: { cancelledAt: expect.any(Date), label: null },
}

function services({ tautulliRow = tautulli as Tautulli | null, plexRow = plex as typeof plex | null } = {}) {
  jest.mocked(getActiveService).mockImplementation((async (kind: string) => (kind === 'tautulli' ? tautulliRow : plexRow)) as never)
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(inSerializable).mockImplementation(async (fn) => fn(tx))
  jest.mocked(withMachineIdentifier).mockImplementation(async (server) => ({ ...server, machineIdentifier: 'machine-1' }))
  prismaMock.invite.updateMany.mockResolvedValue({ count: 3 })
  services()
})

describe('saveAffiliateSettings', () => {
  it('turns the switch on and stores the machine id', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateInvitesEnabled: false }))

    await expect(saveAffiliateSettings(input, 'admin-1')).resolves.toEqual({ ok: true, invitesCancelled: 0 })
    const after = {
      affiliateInvitesEnabled: true,
      affiliateTiers: input.tiers,
      affiliateServerCap: 10,
      affiliateLibrarySectionIds: [1],
      affiliatePlexMachineId: 'machine-1',
    }
    expect(prismaMock.config.upsert).toHaveBeenCalledWith({
      where: { id: 'config' },
      create: { id: 'config', ...after, updatedBy: 'admin-1' },
      update: { ...after, updatedBy: 'admin-1' },
    })
    expect(prismaMock.invite.updateMany).not.toHaveBeenCalled()
    expect(recordAuditEvent).toHaveBeenCalledWith(
      AuditEventType.CONFIG_CHANGED,
      'admin-1',
      expect.objectContaining({ section: 'affiliates', changedFields: expect.arrayContaining(['affiliateInvitesEnabled', 'affiliatePlexMachineId']) }),
      tx
    )
  })

  it.each([
    ['Tautulli is not connected', () => services({ tautulliRow: null }), /Connect Tautulli/],
    ['no Plex server is set up', () => services({ plexRow: null }), /Connect a Plex server/],
    ['Plex sends no machine id', () => jest.mocked(withMachineIdentifier).mockImplementation(async (server) => server), /server ID/],
  ])('refuses the switch on while %s and writes nothing', async (_label, arrange, reason) => {
    arrange()
    const result = await saveAffiliateSettings(input, 'admin-1')
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(reason) })
    expect(inSerializable).not.toHaveBeenCalled()
  })

  it('saves while the switch stays on the same server', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateInvitesEnabled: true, affiliatePlexMachineId: 'machine-1' }))
    await expect(saveAffiliateSettings({ ...input, cap: 20 }, 'admin-1')).resolves.toEqual({ ok: true, invitesCancelled: 0 })
    expect(prismaMock.config.upsert).toHaveBeenCalled()
  })

  it('refuses to keep the switch on after the Plex server changed, and writes nothing', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateInvitesEnabled: true, affiliatePlexMachineId: 'machine-old' }))

    await expect(saveAffiliateSettings(input, 'admin-1')).resolves.toEqual({ ok: false, reason: expect.stringMatching(/Plex server changed/) })
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
    expect(recordAuditEvent).not.toHaveBeenCalled()
  })

  it('turns the switch off, cancels every open invite and audits the count', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateInvitesEnabled: true, affiliatePlexMachineId: 'machine-1' }))

    await expect(saveAffiliateSettings({ ...input, enabled: false }, 'admin-1')).resolves.toEqual({ ok: true, invitesCancelled: 3 })
    expect(getActiveService).not.toHaveBeenCalled()
    expect(prismaMock.config.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ affiliateInvitesEnabled: false, affiliatePlexMachineId: 'machine-1' }) })
    )
    expect(prismaMock.invite.updateMany).toHaveBeenCalledWith(cancelled)
    expect(recordAuditEvent).toHaveBeenCalledWith(AuditEventType.AFFILIATE_INVITE_CANCELLED, 'admin-1', { cause: 'switch_off', count: 3 }, tx)
  })

  it('cancels nothing when the switch was already off', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateInvitesEnabled: false }))

    await expect(saveAffiliateSettings({ ...input, enabled: false }, 'admin-1')).resolves.toEqual({ ok: true, invitesCancelled: 0 })
    expect(prismaMock.invite.updateMany).not.toHaveBeenCalled()
  })

  it('saves on a first run without a Config row', async () => {
    prismaMock.config.findUnique.mockResolvedValue(null)
    await expect(saveAffiliateSettings({ ...input, enabled: false }, 'admin-1')).resolves.toEqual({ ok: true, invitesCancelled: 0 })
    expect(prismaMock.config.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ affiliatePlexMachineId: null }) }))
  })
})

describe('turnOffForServerChange', () => {
  it('does nothing while the switch is off', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateInvitesEnabled: false }))
    await expect(turnOffForServerChange('admin-1')).resolves.toBe(false)
    expect(prismaMock.config.update).not.toHaveBeenCalled()
  })

  it('does nothing while the active server is the stored one', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateInvitesEnabled: true, affiliatePlexMachineId: 'machine-1' }))
    prismaMock.plexServer.findFirst.mockResolvedValue(buildPlexServer({ machineIdentifier: 'machine-1' }))
    await expect(turnOffForServerChange('admin-1')).resolves.toBe(false)
    expect(prismaMock.invite.updateMany).not.toHaveBeenCalled()
  })

  it.each([
    ['another server', 'machine-2'],
    ['a server without a machine id', null],
  ])('turns the switch off for %s and cancels the open invites', async (_label, machineIdentifier) => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateInvitesEnabled: true, affiliatePlexMachineId: 'machine-1' }))
    prismaMock.plexServer.findFirst.mockResolvedValue(buildPlexServer({ machineIdentifier }))

    await expect(turnOffForServerChange('admin-1')).resolves.toBe(true)
    expect(prismaMock.config.update).toHaveBeenCalledWith({ where: { id: 'config' }, data: { affiliateInvitesEnabled: false, updatedBy: 'admin-1' } })
    expect(prismaMock.invite.updateMany).toHaveBeenCalledWith(cancelled)
    expect(recordAuditEvent).toHaveBeenCalledWith(AuditEventType.AFFILIATE_INVITE_CANCELLED, 'admin-1', { cause: 'server_change', count: 3 }, tx)
    expect(recordAuditEvent).toHaveBeenCalledWith(
      AuditEventType.CONFIG_CHANGED,
      'admin-1',
      expect.objectContaining({ section: 'affiliates', changedFields: ['affiliateInvitesEnabled'] }),
      tx
    )
  })
})
