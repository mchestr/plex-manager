/**
 * Tests for actions/admin/admin-llm-providers.ts (P2.12, SEC-44): the stored
 * key never goes to a new provider or origin, only admins can save or list,
 * and every save is audited.
 */

import { mockReset } from 'jest-mock-extended'

import { listLLMModels, updateChatLLMProvider, updateWrappedLLMProvider } from '@/actions/admin/admin-llm-providers'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { loadProviderModels, testLLMProviderConnection } from '@/lib/connections/llm-provider'
import type { LLMProvider } from '@/lib/generated/prisma/client'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'
import { consume } from '@/lib/security/rate-limit'
import { getServerSession } from 'next-auth'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('@/lib/connections/llm-provider', () => ({
  loadProviderModels: jest.fn(),
  testLLMProviderConnection: jest.fn(),
}))
jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
}))
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn() }))
// The Rewind model freeze (P8.1) has its own file; here the season is closed.
jest.mock('@/lib/wrapped/season', () => ({ getSeasonState: jest.fn(async () => ({ isOpen: false })) }))

const mockSession = getServerSession as jest.Mock
const mockTest = testLLMProviderConnection as jest.Mock
const mockLoad = loadProviderModels as jest.Mock

function storedRow(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    id: 'row-1',
    provider: 'openai-compatible',
    purpose: 'chat',
    apiKey: 'stored-key',
    model: 'qwen3.6:27b',
    temperature: null,
    maxTokens: null,
    baseUrl: 'http://llm.lan:8000/v1',
    effort: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  mockSession.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })
  ;(consume as jest.Mock).mockResolvedValue({ ok: true })
  mockTest.mockResolvedValue({ success: true })
  prismaMock.$transaction.mockImplementation((async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)) as never)
  prismaMock.lLMProvider.findMany.mockResolvedValue([])
})

describe('updateLLMProviderForPurpose key rule', () => {
  it('reuses the stored key for the same provider and origin', async () => {
    prismaMock.lLMProvider.findFirst.mockResolvedValue(storedRow())

    const result = await updateChatLLMProvider({
      provider: 'openai-compatible',
      baseUrl: 'http://llm.lan:8000/v2/',
      model: 'qwen3.6:27b',
      customModel: true,
    })

    expect(result).toEqual({ success: true, data: null })
    expect(mockTest).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'stored-key', baseUrl: 'http://llm.lan:8000/v2' }),
      { customModel: true }
    )
    expect(prismaMock.lLMProvider.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ apiKey: 'stored-key', baseUrl: 'http://llm.lan:8000/v2', purpose: 'chat' }),
    })
  })

  it('audits a same-origin save with the origin only and secretChanged: false', async () => {
    prismaMock.lLMProvider.findFirst.mockResolvedValue(storedRow())

    await updateChatLLMProvider({ provider: 'openai-compatible', baseUrl: 'http://llm.lan:8000/v2', model: 'qwen3.6:27b' })

    expect(logAuditEvent).toHaveBeenCalledWith(
      AuditEventType.CONFIG_CHANGED,
      'admin-1',
      expect.objectContaining({
        changedFields: ['baseUrl'],
        secretChanged: false,
        origins: { before: { baseUrl: 'http://llm.lan:8000' }, after: { baseUrl: 'http://llm.lan:8000' } },
      })
    )
    expect(JSON.stringify((logAuditEvent as jest.Mock).mock.calls)).not.toContain('stored-key')
  })

  it('never sends the stored key to a new origin', async () => {
    prismaMock.lLMProvider.findFirst.mockResolvedValue(storedRow())

    const result = await updateChatLLMProvider({
      provider: 'openai-compatible',
      baseUrl: 'https://attacker.example/v1',
      model: 'qwen3.6:27b',
    })

    // A keyless server is allowed, but the stored key does not go with it
    expect(result).toEqual({ success: true, data: null })
    expect(mockTest).toHaveBeenCalledWith(expect.objectContaining({ apiKey: undefined }), expect.anything())
    expect(prismaMock.lLMProvider.create).toHaveBeenCalledWith({ data: expect.objectContaining({ apiKey: '' }) })
  })

  it('refuses a blank key after a provider change', async () => {
    prismaMock.lLMProvider.findFirst.mockResolvedValue(storedRow({ provider: 'openai', baseUrl: null }))

    const result = await updateWrappedLLMProvider({ provider: 'anthropic', model: 'claude-sonnet-5-5' })

    expect(result).toEqual({
      success: false,
      code: 'SECRET_REQUIRED',
      error: 'Enter the API key again: the provider or its address changed.',
      fieldErrors: { apiKey: ['Enter the API key again: the provider or its address changed.'] },
    })
    expect(mockTest).not.toHaveBeenCalled()
    expect(prismaMock.lLMProvider.create).not.toHaveBeenCalled()
  })

  it('uses a newly entered key', async () => {
    prismaMock.lLMProvider.findFirst.mockResolvedValue(storedRow({ provider: 'openai', baseUrl: null }))

    await updateWrappedLLMProvider({ provider: 'anthropic', apiKey: ' new-key ', model: 'claude-sonnet-5-5' })

    expect(mockTest).toHaveBeenCalledWith(expect.objectContaining({ provider: 'anthropic', apiKey: 'new-key' }), expect.anything())
  })

  it('stores effort and drops temperature for a model without sampling parameters', async () => {
    prismaMock.lLMProvider.findFirst.mockResolvedValue(null)

    await updateWrappedLLMProvider({
      provider: 'anthropic',
      apiKey: 'k',
      model: 'claude-sonnet-5-5',
      effort: 'low',
      temperature: 0.8,
      maxTokens: 6000,
    })

    expect(prismaMock.lLMProvider.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ effort: 'low', temperature: null, maxTokens: 6000, baseUrl: null }),
    })
  })

  it('returns the connection test error and saves nothing', async () => {
    prismaMock.lLMProvider.findFirst.mockResolvedValue(null)
    mockTest.mockResolvedValue({ success: false, error: 'OpenAI returned HTTP 500' })

    const result = await updateChatLLMProvider({ provider: 'openai', apiKey: 'k', model: 'gpt-4o' })

    expect(result).toEqual({ success: false, code: 'UPSTREAM_UNAVAILABLE', error: 'OpenAI returned HTTP 500' })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a base URL with credentials', async () => {
    prismaMock.lLMProvider.findFirst.mockResolvedValue(null)

    const result = await updateChatLLMProvider({
      provider: 'openai-compatible',
      baseUrl: 'http://user:pass@llm.lan/v1',
      model: 'm',
    })

    expect(result.success).toBe(false)
    expect(mockTest).not.toHaveBeenCalled()
  })
})

describe('admin only, audited, rate-limited', () => {
  it('refuses non-admins without touching the database', async () => {
    mockSession.mockResolvedValue({ user: { id: 'member-1', isAdmin: false } })

    expect(await updateChatLLMProvider({ provider: 'openai', apiKey: 'k', model: 'gpt-4o' })).toMatchObject({
      success: false,
      code: 'FORBIDDEN',
    })
    expect(await listLLMModels({ purpose: 'chat', provider: 'openai', apiKey: 'k' })).toEqual({
      success: false,
      error: 'Admin access required',
    })
    expect(prismaMock.lLMProvider.findFirst).not.toHaveBeenCalled()
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it('writes an audit entry without the key', async () => {
    prismaMock.lLMProvider.findFirst.mockResolvedValue(storedRow({ provider: 'openai', baseUrl: null, model: 'gpt-4o' }))

    await updateChatLLMProvider({ provider: 'openai', apiKey: 'sk-new-secret', model: 'gpt-6-sol' })

    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.CONFIG_CHANGED, 'admin-1', {
      section: 'llm.chat',
      changedFields: ['model'],
      secretChanged: true,
      origins: { before: { baseUrl: null }, after: { baseUrl: null } },
      from: { provider: 'openai', model: 'gpt-4o' },
      to: { provider: 'openai', model: 'gpt-6-sol' },
    })
    expect(JSON.stringify((logAuditEvent as jest.Mock).mock.calls)).not.toContain('sk-new-secret')
  })

  it('stops when the rate limit is spent', async () => {
    ;(consume as jest.Mock).mockResolvedValue({ ok: false, retryAfterSec: 60 })

    const result = await listLLMModels({ purpose: 'chat', provider: 'openai', apiKey: 'k' })

    expect(result.success).toBe(false)
    expect(mockLoad).not.toHaveBeenCalled()
  })
})

describe('listLLMModels', () => {
  it('lists the active provider with its stored settings for the playground', async () => {
    prismaMock.lLMProvider.findFirst.mockResolvedValue(storedRow({ provider: 'anthropic', baseUrl: null, model: 'claude-sonnet-5-5' }))
    mockLoad.mockResolvedValue({ success: true, models: ['claude-sonnet-5-5'] })

    const result = await listLLMModels({ purpose: 'wrapped' })

    expect(result).toEqual({
      success: true,
      models: ['claude-sonnet-5-5'],
      configuredProvider: 'anthropic',
      configuredModel: 'claude-sonnet-5-5',
    })
    expect(mockLoad).toHaveBeenCalledWith({ provider: 'anthropic', apiKey: 'stored-key', baseUrl: undefined })
  })

  it('applies the same key rule as saving', async () => {
    prismaMock.lLMProvider.findFirst.mockResolvedValue(storedRow())
    mockLoad.mockResolvedValue({ success: true, models: [] })

    await listLLMModels({ purpose: 'chat', provider: 'openai-compatible', baseUrl: 'http://other.lan/v1' })

    expect(mockLoad).toHaveBeenCalledWith({ provider: 'openai-compatible', apiKey: undefined, baseUrl: 'http://other.lan/v1' })
  })

  it('asks for a key before listing a keyed provider', async () => {
    prismaMock.lLMProvider.findFirst.mockResolvedValue(null)

    expect(await listLLMModels({ purpose: 'chat', provider: 'google' })).toEqual({
      success: false,
      error: 'Enter the API key first',
    })
  })

  it('validates its input', async () => {
    expect(await listLLMModels({ purpose: 'other' as 'chat' })).toEqual({ success: false, error: 'Invalid request' })
  })
})
