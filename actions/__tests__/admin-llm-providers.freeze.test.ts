/**
 * Rewind's model freeze in settings (P8.1): from the season's opening to its
 * close a `wrapped` provider or model change is refused, while a key rotation
 * and the assistant's provider stay open.
 */

import { mockReset } from 'jest-mock-extended'

import { updateChatLLMProvider, updateWrappedLLMProvider } from '@/actions/admin/admin-llm-providers'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { testLLMProviderConnection } from '@/lib/connections/llm-provider'
import type { LLMProvider } from '@/lib/generated/prisma/client'
import { consume } from '@/lib/security/rate-limit'
import { getServerSession } from 'next-auth'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/connections/llm-provider', () => ({ loadProviderModels: jest.fn(), testLLMProviderConnection: jest.fn() }))
jest.mock('@/lib/security/audit-log', () => ({ ...jest.requireActual('@/lib/security/audit-log'), logAuditEvent: jest.fn() }))
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn() }))
jest.mock('@/lib/utils/server-zone', () => ({ serverZone: jest.fn(async () => 'America/Chicago') }))

const FROZEN = "Rewind's model is frozen until the season closes on 31 January"

function row(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    id: 'row-1', provider: 'anthropic', purpose: 'wrapped', apiKey: 'stored-key', model: 'claude-sonnet-5-5', temperature: null,
    maxTokens: null, baseUrl: null, effort: null, isActive: true, createdAt: new Date(0), updatedAt: new Date(0), ...overrides,
  }
}

function at(iso: string) {
  jest.useFakeTimers({ now: new Date(iso), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'queueMicrotask'] })
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })
  ;(consume as jest.Mock).mockResolvedValue({ ok: true })
  ;(testLLMProviderConnection as jest.Mock).mockResolvedValue({ success: true })
  prismaMock.$transaction.mockImplementation((async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)) as never)
  prismaMock.lLMProvider.findMany.mockResolvedValue([])
  prismaMock.config.findUnique.mockResolvedValue(null)
  prismaMock.lLMProvider.findFirst.mockResolvedValue(row())
})

afterEach(() => jest.useRealTimers())

describe('the Rewind model freeze', () => {
  it('refuses a model change on 2026-12-05 without testing the connection', async () => {
    at('2026-12-05T12:00:00Z')
    const result = await updateWrappedLLMProvider({ provider: 'anthropic', model: 'claude-haiku-5-5' })

    expect(result).toEqual({ success: false, code: 'CONFLICT', error: FROZEN })
    expect(testLLMProviderConnection).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('refuses a provider change in the season, with a new key', async () => {
    at('2027-01-20T12:00:00Z')
    const result = await updateWrappedLLMProvider({ provider: 'openai', apiKey: 'k', model: 'gpt-6-sol' })
    expect(result).toEqual({ success: false, code: 'CONFLICT', error: FROZEN })
  })

  it('allows a model change after the season closes, on 2027-02-01', async () => {
    at('2027-02-01T12:00:00Z')
    const result = await updateWrappedLLMProvider({ provider: 'anthropic', model: 'claude-haiku-5-5' })
    expect(result).toEqual({ success: true, data: null })
  })

  it('allows a key rotation in the season', async () => {
    at('2026-12-05T12:00:00Z')
    const result = await updateWrappedLLMProvider({ provider: 'anthropic', apiKey: 'rotated', model: 'claude-sonnet-5-5' })

    expect(result).toEqual({ success: true, data: null })
    expect(prismaMock.lLMProvider.create).toHaveBeenCalledWith({ data: expect.objectContaining({ apiKey: 'rotated', model: 'claude-sonnet-5-5' }) })
  })

  it('never blocks the assistant', async () => {
    at('2026-12-05T12:00:00Z')
    prismaMock.lLMProvider.findFirst.mockResolvedValue(row({ purpose: 'chat', provider: 'openai', model: 'gpt-6-sol' }))
    const result = await updateChatLLMProvider({ provider: 'anthropic', apiKey: 'k', model: 'claude-sonnet-5-5' })
    expect(result).toEqual({ success: true, data: null })
  })
})
