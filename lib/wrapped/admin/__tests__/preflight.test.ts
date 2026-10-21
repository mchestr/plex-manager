/**
 * @jest-environment node
 */

/**
 * The season console's preflight rows (P7.8): Redis, the Tautulli version
 * warning, the optional services, the model's price and retirement, and the
 * entitlement skip count.
 */

import { mockReset } from 'jest-mock-extended'

import { buildConfig } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getTautulliInfo } from '@/lib/connections/tautulli'
import { checkRewindInfra } from '@/lib/queue/rewind-infra'
import { getRewindPreflight, type PreflightRow } from '@/lib/wrapped/admin/preflight'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/connections/tautulli', () => ({ getTautulliInfo: jest.fn() }))
jest.mock('@/lib/queue/rewind-infra', () => ({ checkRewindInfra: jest.fn() }))

const TAUTULLI = { url: 'http://tautulli', apiKey: 'key' }

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(checkRewindInfra).mockResolvedValue({ ok: true })
  jest.mocked(getTautulliInfo).mockResolvedValue({ ok: true, data: { version: '2.17.0' } })
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ llmDisabled: false, rewindLlmMode: 'standard', stripeEnabled: false }))
  prismaMock.tautulli.findFirst.mockResolvedValue(TAUTULLI as never)
  prismaMock.overseerr.count.mockResolvedValue(1)
  prismaMock.sonarr.count.mockResolvedValue(0)
  prismaMock.lLMProvider.findFirst.mockResolvedValue({ provider: 'openai', model: 'gpt-6-luna' } as never)
  prismaMock.user.count.mockResolvedValue(0)
})

const row = (rows: PreflightRow[], id: PreflightRow['id']) => rows.find((r) => r.id === id)

describe('getRewindPreflight', () => {
  it('passes every row on a healthy server, with the optional ones in order', async () => {
    const rows = await getRewindPreflight()

    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ['redis', 'ok'],
      ['tautulli', 'ok'],
      ['overseerr', 'ok'],
      ['sonarr', 'notConfigured'],
      ['llm', 'ok'],
    ])
  })

  it('says Rewind needs Redis when REDIS_URL is missing', async () => {
    jest.mocked(checkRewindInfra).mockResolvedValue({ ok: false, code: 'REDIS_NOT_CONFIGURED' })

    expect(row(await getRewindPreflight(), 'redis')).toMatchObject({ status: 'notConfigured', detail: 'Rewind needs Redis (REDIS_URL)' })
  })

  it('warns about Tautulli 2.16.9 and passes 2.17.0', async () => {
    jest.mocked(getTautulliInfo).mockResolvedValue({ ok: true, data: { version: '2.16.9' } })
    const old = row(await getRewindPreflight(), 'tautulli')
    expect(old).toMatchObject({ status: 'incomplete' })
    expect(old?.detail).toMatch(/^Update Tautulli: versions before 2\.17 are affected by CVE-2026-31799/)

    jest.mocked(getTautulliInfo).mockResolvedValue({ ok: true, data: { version: '2.17.0' } })
    expect(row(await getRewindPreflight(), 'tautulli')).toMatchObject({ status: 'ok', detail: 'Version 2.17.0' })
  })

  it('reports an unreachable Tautulli and a missing one', async () => {
    jest.mocked(getTautulliInfo).mockResolvedValue({ ok: false, code: 'TIMEOUT' } as never)
    expect(row(await getRewindPreflight(), 'tautulli')?.status).toBe('unreachable')

    prismaMock.tautulli.findFirst.mockResolvedValue(null)
    expect(row(await getRewindPreflight(), 'tautulli')?.status).toBe('notConfigured')
  })

  it('warns about a model that retires before the season ends, and one with no price', async () => {
    prismaMock.lLMProvider.findFirst.mockResolvedValue({ provider: 'openai', model: 'o4-mini' } as never)
    const retiring = row(await getRewindPreflight(), 'llm')
    expect(retiring?.status).toBe('incomplete')
    expect(retiring?.detail).toMatch(/retires on/)

    prismaMock.lLMProvider.findFirst.mockResolvedValue({ provider: 'openai-compatible', model: 'qwen3.6:27b' } as never)
    expect(row(await getRewindPreflight(), 'llm')).toMatchObject({ status: 'incomplete', detail: expect.stringMatching(/no known price/) })
  })

  it('reports template-only mode', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindLlmMode: 'off' }))

    expect(row(await getRewindPreflight(), 'llm')?.status).toBe('degraded')
  })

  it('counts the members skipped for entitlement only with Stripe on', async () => {
    expect(row(await getRewindPreflight(), 'entitlement')).toBeUndefined()

    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled: true }))
    prismaMock.user.count.mockResolvedValue(3)
    expect(row(await getRewindPreflight(), 'entitlement')).toMatchObject({
      status: 'incomplete',
      detail: '3 members are skipped: no active membership',
    })
  })
})
