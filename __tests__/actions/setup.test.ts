/**
 * Tests for actions/setup.ts, the setup wizard's saves (P10.24): each save
 * moves the wizard to the step after it and never backwards, Skip for now
 * advances optional steps without a service row, and the service saves make
 * their row the one active row. The claim itself is covered by
 * __tests__/security/setup-actions-security.test.ts, which runs every export.
 */

import { mockDeep, mockReset, type DeepMockProxy } from 'jest-mock-extended'
import { revalidatePath } from 'next/cache'

import { buildSetup } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import {
  completeSetup,
  saveChatLLMProvider,
  saveDiscordIntegration,
  saveLLMProvider,
  saveOverseerr,
  savePlexServer,
  savePrometheus,
  saveRadarr,
  saveSonarr,
  saveTautulli,
  skipSetupStep,
} from '@/actions/setup'
import { testLLMProviderConnection } from '@/lib/connections/llm-provider'
import { testOverseerrConnection } from '@/lib/connections/overseerr'
import { getPlexUserInfo, testPlexConnection } from '@/lib/connections/plex'
import { testPrometheusConnection } from '@/lib/connections/prometheus'
import { testRadarrConnection } from '@/lib/connections/radarr'
import { testSonarrConnection } from '@/lib/connections/sonarr'
import { testTautulliConnection } from '@/lib/connections/tautulli'
import type { Prisma } from '@/lib/generated/prisma/client'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'
import { getSetupStatus } from '@/lib/setup/status'
import type { SetupPosition } from '@/types/setup'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/connections/plex', () => ({
  testPlexConnection: jest.fn(),
  getPlexUserInfo: jest.fn(),
  getPlexServerIdentity: jest.fn().mockResolvedValue({ success: true, machineIdentifier: 'machine-abc' }),
}))
jest.mock('@/lib/connections/jellyfin', () => ({ testJellyfinConnection: jest.fn() }))
jest.mock('@/lib/connections/tautulli', () => ({ testTautulliConnection: jest.fn() }))
jest.mock('@/lib/connections/overseerr', () => ({ testOverseerrConnection: jest.fn() }))
jest.mock('@/lib/connections/sonarr', () => ({ testSonarrConnection: jest.fn() }))
jest.mock('@/lib/connections/radarr', () => ({ testRadarrConnection: jest.fn() }))
jest.mock('@/lib/connections/prometheus', () => ({
  testPrometheusConnection: jest.fn(),
  validatePrometheusQuery: jest.fn().mockResolvedValue({ success: true, data: null }),
}))
jest.mock('@/lib/connections/llm-provider', () => ({ testLLMProviderConnection: jest.fn() }))
jest.mock('@/lib/security/audit-log', () => ({ ...jest.requireActual('@/lib/security/audit-log'), logAuditEvent: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn(), unstable_cache: (load: unknown) => load }))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

// This browser holds the setup claim; __tests__/security/setup-actions-security.test.ts covers the claim
jest.mock('@/lib/setup/claim', () => ({
  requireSetupClaim: async () => ({ ok: true }),
  clearSetupClaimCookie: async () => undefined,
}))

const TESTERS = [
  testPlexConnection,
  testTautulliConnection,
  testOverseerrConnection,
  testSonarrConnection,
  testRadarrConnection,
  testPrometheusConnection,
  testLLMProviderConnection,
]

let tx: DeepMockProxy<Prisma.TransactionClient>

/** The wizard's row, as both the guard's read and the transaction's read see it; null before the first save. */
function wizardAt(position: SetupPosition | null) {
  const row = position && buildSetup({ currentStepId: position })
  prismaMock.setup.findFirst.mockResolvedValue(row)
  tx.setup.findFirst.mockResolvedValue(row)
}

/** Where the transaction moved the wizard: the created or updated id, or null when it did not move. */
function movedTo(): string | null {
  const created = tx.setup.create.mock.calls[0]?.[0].data.currentStepId
  const updated = tx.setup.update.mock.calls[0]?.[0].data.currentStepId
  return (created ?? updated ?? null) as string | null
}

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  tx = mockDeep<Prisma.TransactionClient>()
  prismaMock.$transaction.mockImplementation((callback) => callback(tx))
  for (const tester of TESTERS) jest.mocked(tester).mockResolvedValue({ success: true })
  jest.mocked(getPlexUserInfo).mockResolvedValue({ success: true, data: { id: 'plex-user-123' } } as never)
  wizardAt(null)
})

describe('getSetupStatus', () => {
  it('returns the stored step id', async () => {
    prismaMock.setup.findFirst.mockResolvedValue(buildSetup({ isComplete: true, currentStepId: 'radarr' }))

    await expect(getSetupStatus()).resolves.toEqual({ isComplete: true, currentStepId: 'radarr' })
  })

  it('starts at Plex with no row, or with an id it does not know', async () => {
    await expect(getSetupStatus()).resolves.toEqual({ isComplete: false, currentStepId: 'plex' })

    prismaMock.setup.findFirst.mockResolvedValue(buildSetup({ currentStepId: '7' }))
    await expect(getSetupStatus()).resolves.toEqual({ isComplete: false, currentStepId: 'plex' })
  })
})

const service = { name: 'Server', apiKey: 'key-123' }

describe('each save moves the wizard to the step after it', () => {
  it.each<[string, () => Promise<unknown>, SetupPosition, SetupPosition]>([
    ['savePlexServer', () => savePlexServer({ name: 'Plex', url: 'https://plex.lan:32400', token: 't' }), 'plex', 'tautulli'],
    ['saveTautulli', () => saveTautulli({ ...service, url: 'http://tautulli.lan:8181' }), 'tautulli', 'overseerr'],
    ['saveOverseerr', () => saveOverseerr({ ...service, url: 'http://overseerr.lan:5055' }), 'overseerr', 'sonarr'],
    ['saveSonarr', () => saveSonarr({ ...service, url: 'http://sonarr.lan:8989' }), 'sonarr', 'radarr'],
    ['saveRadarr', () => saveRadarr({ ...service, url: 'http://radarr.lan:7878' }), 'radarr', 'llm-rewind'],
    ['saveLLMProvider', () => saveLLMProvider({ provider: 'openai', apiKey: 'sk-1' }), 'llm-rewind', 'llm-chat'],
    ['saveChatLLMProvider', () => saveChatLLMProvider({ provider: 'openai', apiKey: 'sk-1' }), 'llm-chat', 'discord'],
    ['saveDiscordIntegration', () => saveDiscordIntegration({ isEnabled: false }), 'discord', 'prometheus'],
    ['savePrometheus', () => savePrometheus({ name: 'Plex', url: 'http://prom.lan:9090', query: 'up' }), 'prometheus', 'summary'],
  ])('%s: %s to %s', async (_name, save, from, to) => {
    wizardAt(from)

    await expect(save()).resolves.toEqual({ success: true, data: null })

    expect(movedTo()).toBe(to)
    expect(revalidatePath).toHaveBeenCalledWith('/setup')
  })

  it('creates the wizard row on the first save', async () => {
    await savePlexServer({ name: 'Plex', url: 'https://plex.lan:32400', token: 't' })

    expect(tx.setup.create).toHaveBeenCalledWith({ data: { currentStepId: 'tautulli' } })
  })

  it('the Rewind writer leads to the admin assistant, never the summary (the old step-10 write)', async () => {
    wizardAt('llm-rewind')

    await saveLLMProvider({ provider: 'openai', apiKey: 'sk-1' })

    expect(tx.setup.update).toHaveBeenCalledWith({ where: { id: 'setup-1' }, data: { currentStepId: 'llm-chat' } })
  })

  it('keeps the position after Back and a second save', async () => {
    wizardAt('discord')

    await expect(saveTautulli({ ...service, url: 'http://tautulli.lan:8181' })).resolves.toEqual({ success: true, data: null })

    expect(tx.setup.update).not.toHaveBeenCalled()
    expect(tx.setup.create).not.toHaveBeenCalled()
  })
})

describe('service saves', () => {
  it('saves Plex with its owner and machine id, as the one active row', async () => {
    wizardAt('plex')

    await savePlexServer({ name: 'Plex', url: 'https://plex.lan:32400', token: 'plex-token', publicUrl: 'https://plex.example.com' })

    expect(getPlexUserInfo).toHaveBeenCalledWith('plex-token')
    expect(tx.plexServer.updateMany).toHaveBeenCalledWith({ where: { isActive: true }, data: { isActive: false } })
    expect(tx.plexServer.create).toHaveBeenCalledWith({
      data: {
        name: 'Plex',
        url: 'https://plex.lan:32400',
        token: 'plex-token',
        publicUrl: 'https://plex.example.com',
        adminPlexUserId: 'plex-user-123',
        machineIdentifier: 'machine-abc',
        isActive: true,
      },
    })
  })

  it('refuses a failed connection test with code copy and writes nothing', async () => {
    jest.mocked(testTautulliConnection).mockResolvedValue({ success: false, error: 'Invalid API key' })

    const result = await saveTautulli({ ...service, url: 'http://tautulli.lan:8181' })

    expect(result).toMatchObject({ success: false, code: 'UPSTREAM_UNAVAILABLE', fieldErrors: { apiKey: [expect.any(String)] } })
    expect(JSON.stringify(result)).not.toContain('Invalid API key')
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('refuses a Plex token whose account cannot be read', async () => {
    jest.mocked(getPlexUserInfo).mockResolvedValue({ success: false, error: 'nope' } as never)

    const result = await savePlexServer({ name: 'Plex', url: 'https://plex.lan:32400', token: 't' })

    expect(result).toMatchObject({ success: false, code: 'UPSTREAM_UNAVAILABLE', fieldErrors: { token: [expect.any(String)] } })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('refuses a blank key for a new host before any connection test', async () => {
    prismaMock.tautulli.findFirst.mockResolvedValue({
      id: 't1',
      name: 'Tautulli',
      url: 'http://tautulli.lan:8181',
      publicUrl: null,
      apiKey: 'stored-tautulli-key',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await saveTautulli({ name: 'Tautulli', url: 'http://listener.example:8181' })

    expect(result).toMatchObject({ success: false, code: 'SECRET_REQUIRED', error: 'Enter the API key again to use it with the new address.' })
    expect(testTautulliConnection).not.toHaveBeenCalled()
  })

  it('audits the save as the setup actor with origins only', async () => {
    await saveTautulli({ name: 'Tautulli', url: 'http://tautulli.lan:8181/path', apiKey: 'first-key' })

    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.CONFIG_CHANGED, 'setup', {
      section: 'setup.tautulli',
      changedFields: ['name', 'publicUrl', 'url'],
      secretChanged: true,
      origins: { before: null, after: { url: 'http://tautulli.lan:8181', publicUrl: null } },
    })
    expect(JSON.stringify(jest.mocked(logAuditEvent).mock.calls)).not.toContain('first-key')
  })
})

describe('skipSetupStep', () => {
  it.each(['plex', 'tautulli'])('refuses the required step %s', async (stepId) => {
    wizardAt('radarr')

    await expect(skipSetupStep({ stepId } as never)).resolves.toMatchObject({ success: false, code: 'VALIDATION' })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('moves past an optional step without writing a service row, and audits it', async () => {
    wizardAt('sonarr')

    await expect(skipSetupStep({ stepId: 'sonarr' })).resolves.toEqual({ success: true, data: null })

    expect(movedTo()).toBe('radarr')
    expect(tx.sonarr.create).not.toHaveBeenCalled()
    expect(tx.sonarr.updateMany).not.toHaveBeenCalled()
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.SETUP_STEP_SKIPPED, 'setup', { stepId: 'sonarr' })
  })

  it('skips the last step to the summary', async () => {
    wizardAt('prometheus')

    await skipSetupStep({ stepId: 'prometheus' })

    expect(movedTo()).toBe('summary')
  })

  it('refuses a step the wizard has not reached', async () => {
    wizardAt('tautulli')

    await expect(skipSetupStep({ stepId: 'prometheus' })).resolves.toMatchObject({ success: false, code: 'CONFLICT' })
    expect(movedTo()).toBeNull()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})

describe('LLM saves', () => {
  it('replace the purpose\'s active provider', async () => {
    await saveLLMProvider({ provider: 'openai', apiKey: 'openai-key', model: 'gpt-4' })

    expect(tx.lLMProvider.updateMany).toHaveBeenCalledWith({ where: { isActive: true, purpose: 'wrapped' }, data: { isActive: false } })
    expect(tx.lLMProvider.create).toHaveBeenCalledWith({
      data: { provider: 'openai', purpose: 'wrapped', apiKey: 'openai-key', model: 'gpt-4', temperature: null, maxTokens: null, isActive: true },
    })
  })

  it('default to the current default model', async () => {
    await saveLLMProvider({ provider: 'openai', apiKey: 'openai-key' })

    expect(tx.lLMProvider.create).toHaveBeenCalledWith({ data: expect.objectContaining({ model: 'gpt-5.4-mini' }) })
  })

  it('refuse a failed key check', async () => {
    jest.mocked(testLLMProviderConnection).mockResolvedValue({ success: false, error: 'Invalid API key' })

    await expect(saveLLMProvider({ provider: 'openai', apiKey: 'openai-key' })).resolves.toMatchObject({ success: false })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('keep the stored OpenAI key when the field is blank (a step revisited with Back)', async () => {
    prismaMock.lLMProvider.findFirst.mockResolvedValue({ apiKey: 'stored-key' } as never)

    await expect(saveChatLLMProvider({ provider: 'openai', model: 'gpt-4' })).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.lLMProvider.findFirst).toHaveBeenCalledWith({ where: { isActive: true, purpose: 'chat', provider: 'openai', baseUrl: null } })
    expect(testLLMProviderConnection).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'stored-key' }), { customModel: true })
    expect(tx.lLMProvider.create).toHaveBeenCalledWith({ data: expect.objectContaining({ apiKey: 'stored-key' }) })
  })

  it('refuse a blank key with none stored, on the field', async () => {
    await expect(saveLLMProvider({ provider: 'openai', apiKey: ' ' })).resolves.toMatchObject({
      success: false,
      code: 'VALIDATION',
      fieldErrors: { apiKey: ['API key is required'] },
    })
    expect(testLLMProviderConnection).not.toHaveBeenCalled()
  })
})

describe('saveDiscordIntegration', () => {
  it('keeps the stored client secret when the field is blank', async () => {
    prismaMock.discordIntegration.findUnique.mockResolvedValue({ clientSecret: 'stored-secret', botToken: null } as never)

    await expect(saveDiscordIntegration({ isEnabled: true, clientId: 'client-1' })).resolves.toEqual({ success: true, data: null })

    expect(tx.discordIntegration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ isEnabled: true, clientId: 'client-1', clientSecret: 'stored-secret' }) })
    )
  })

  it('refuses linked roles without a client secret, on the field', async () => {
    await expect(saveDiscordIntegration({ isEnabled: true, clientId: 'client-1' })).resolves.toMatchObject({
      success: false,
      code: 'VALIDATION',
      fieldErrors: { clientSecret: [expect.any(String)] },
    })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})

describe('completeSetup', () => {
  it('marks setup complete and clears the claim', async () => {
    prismaMock.setup.findFirst.mockResolvedValue(buildSetup({ currentStepId: 'summary' }))

    await expect(completeSetup()).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.setup.update).toHaveBeenCalledWith({
      where: { id: 'setup-1' },
      data: { isComplete: true, completedAt: expect.any(Date), claimId: null, claimCodeHash: null },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })
})
