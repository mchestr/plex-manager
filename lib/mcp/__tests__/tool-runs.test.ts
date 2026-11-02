/**
 * @jest-environment node
 */

/** What each kind of tool does when called: an action, an admin read and an assistant tool. */

import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { executeToolCall } from '@/lib/chatbot/executors'
import { listAnnouncements } from '@/lib/admin/announcements'
import { getAllUsersWithWrapped } from '@/lib/data/admin-users'
import { getAffiliateHistory } from '@/lib/data/affiliate-history'
import { getRequestTierSettings } from '@/lib/data/community-stats'
import { getLLMUsageById, getLLMUsageRecords } from '@/lib/data/llm-usage'
import { allTools } from '@/lib/mcp/catalog'
import { runAsPrincipal } from '@/lib/mcp/principal'
import { handleMessage } from '@/lib/mcp/server'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next/cache', () => ({ ...jest.requireActual('next/cache'), revalidatePath: jest.fn(), revalidateTag: jest.fn(), updateTag: jest.fn(), refresh: jest.fn() }))
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn(async () => ({ ok: true })), actionClientIp: jest.fn() }))
jest.mock('@/lib/security/audit-log', () => ({ ...jest.requireActual('@/lib/security/audit-log'), logAuditEvent: jest.fn() }))
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), getBaseUrl: () => 'https://plex.example.com' }))
jest.mock('@/lib/chatbot/executors', () => ({ executeToolCall: jest.fn() }))
jest.mock('@/lib/settings/app-settings', () => ({
  ...jest.requireActual('@/lib/settings/app-settings'),
  getFormatSettings: jest.fn(async () => ({ timeZone: 'UTC', locale: 'en-US' })),
}))
jest.mock('@/lib/data/admin-users', () => ({ getAllUsersWithWrapped: jest.fn() }))
jest.mock('@/lib/data/llm-usage', () => ({ getLLMUsageRecords: jest.fn(), getLLMUsageById: jest.fn() }))
jest.mock('@/lib/data/affiliate-history', () => ({ getAffiliateHistory: jest.fn() }))
jest.mock('@/lib/admin/announcements', () => ({ ...jest.requireActual('@/lib/admin/announcements'), listAnnouncements: jest.fn() }))
jest.mock('@/lib/data/community-stats', () => ({ ...jest.requireActual('@/lib/data/community-stats'), getRequestTierSettings: jest.fn() }))
jest.mock('@/lib/wrapped/season', () => ({ getSeasonState: jest.fn(async () => ({ seasonYear: 2026 })) }))

const admin: Session = { user: { id: 'admin-1', name: 'Mike', isAdmin: true, role: null }, expires: '' }

function run(name: string, args: Record<string, unknown>, session = admin, scope: 'full' | 'read' = 'full') {
  const tool = allTools().get(name)
  if (!tool) throw new Error(`no tool ${name}`)
  return runAsPrincipal(session, () => tool.run(args, { session, scope }))
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(getServerSession).mockReset()
})

describe('an action tool', () => {
  it('runs the action as the principal and adds the invite link', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(null)
    prismaMock.invite.create.mockResolvedValue({ id: 'inv-1', code: 'ABCD2345' } as never)

    const result = await run('create_invite', { maxUses: 2, expiresIn: '7d' })

    expect(JSON.parse(result.text)).toEqual({
      success: true,
      data: { id: 'inv-1', code: 'ABCD2345', url: 'https://plex.example.com/invite/ABCD2345' },
    })
    expect(result.isError).toBe(false)
    expect(prismaMock.invite.create.mock.calls[0][0].data).toMatchObject({ createdBy: 'admin-1', maxUses: 2 })
    expect(getServerSession).not.toHaveBeenCalled()
  })

  it("returns the action's refusal as an error", async () => {
    const result = await run('create_invite', { maxUses: 'lots' })
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.text)).toMatchObject({ success: false, code: 'VALIDATION' })
  })

  it('unwraps a bare input', async () => {
    prismaMock.config.upsert.mockResolvedValue({} as never)
    const result = await run('set_llm_disabled', { input: 'yes' })
    expect(JSON.parse(result.text)).toMatchObject({ success: false, code: 'VALIDATION' })
  })

  it("is still refused by the action's own guard", async () => {
    const member: Session = { user: { id: 'm-1', isAdmin: false, role: null }, expires: '' }
    const result = await run('delete_invite', { id: 'inv-1' }, member)
    expect(JSON.parse(result.text)).toMatchObject({ success: false, code: 'FORBIDDEN' })
  })
})

describe('a read tool', () => {
  it('reads for the current season by default', async () => {
    jest.mocked(getAllUsersWithWrapped).mockResolvedValue({ users: [], plexCheck: { status: 'ok' } } as never)
    const result = await run('list_users', {})
    expect(JSON.parse(result.text)).toEqual({
      success: true,
      data: { plexCheck: { status: 'ok' }, total: 0, page: 1, pageSize: 25, totalPages: 0, showing: 'none', users: [] },
    })
    expect(getAllUsersWithWrapped).toHaveBeenCalledWith(2026)
  })

  it('pages and searches users, with list rows only', async () => {
    const users = Array.from({ length: 30 }, (_, index) => ({
      id: `u${index}`,
      name: index % 2 ? `Sam ${index}` : `Kim ${index}`,
      email: `user${index}@example.com`,
      image: 'https://plex.tv/avatar.png',
      stripeCustomerId: 'cus_secret',
      llmUsage: { totalCost: 1 },
      wrappedStatus: 'completed',
    }))
    jest.mocked(getAllUsersWithWrapped).mockResolvedValue({ users, plexCheck: { status: 'ok' } } as never)

    const data = JSON.parse((await run('list_users', { q: 'sam', page: 2, pageSize: 5 })).text).data

    expect(data).toMatchObject({ total: 15, page: 2, pageSize: 5, totalPages: 3, showing: 'showing 6-10 of 15' })
    expect(data.users.map((user: { id: string }) => user.id)).toEqual(['u11', 'u13', 'u15', 'u17', 'u19'])
    expect(data.users[0]).toMatchObject({ name: 'Sam 11', email: 'user11@example.com', rewindStatus: 'completed' })
    expect(data.users[0]).not.toHaveProperty('image')
    expect(data.users[0]).not.toHaveProperty('stripeCustomerId')
    expect(data.users[0]).not.toHaveProperty('llmUsage')
  })

  it('lists LLM calls without their prompt and response, and reads one with both clipped', async () => {
    const record = {
      id: 'usage-1',
      provider: 'anthropic',
      model: 'claude',
      prompt: 'p'.repeat(20_000),
      response: 'short',
      cost: 0.12,
      user: { id: 'u1', name: 'Sam', email: 'sam@example.com', image: null },
      wrapped: null,
      chatConversation: { id: 'conv-1', createdAt: '2026-10-01' },
    }
    jest.mocked(getLLMUsageRecords).mockResolvedValue({ records: [record], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } } as never)
    jest.mocked(getLLMUsageById).mockResolvedValue(record as never)

    const list = JSON.parse((await run('list_llm_usage', { userId: 'u1' })).text).data
    expect(getLLMUsageRecords).toHaveBeenCalledWith({ page: 1, pageSize: 20, userId: 'u1' })
    expect(list.records[0]).toEqual({ id: 'usage-1', provider: 'anthropic', model: 'claude', cost: 0.12, wrapped: null, user: { id: 'u1', name: 'Sam' }, promptChars: 20_000, responseChars: 5 })

    const one = JSON.parse((await run('get_llm_usage', { usageId: 'usage-1' })).text).data
    expect(one.prompt).toHaveLength(15_000)
    expect(one).toMatchObject({ promptChars: 20_000, promptTruncated: true, response: 'short', responseChars: 5, responseTruncated: false, user: { id: 'u1', name: 'Sam' } })
  })

  it('refuses a page size over the maximum', async () => {
    const result = await run('list_llm_usage', { pageSize: 51 })
    expect(JSON.parse(result.text)).toMatchObject({ success: false, code: 'VALIDATION' })
  })

  it('lists announcements by status with a preview, and reads one whole', async () => {
    const long = 'a'.repeat(1_000)
    jest.mocked(listAnnouncements).mockResolvedValue([
      { id: 'a1', title: 'Up', content: long, priority: 2, isActive: true, status: 'active', createdAt: '2026-10-01', expiresAt: null },
      { id: 'a2', title: 'Old', content: 'gone', priority: 1, isActive: true, status: 'expired', createdAt: '2026-09-01', expiresAt: '2026-09-02' },
    ])

    const list = JSON.parse((await run('list_announcements', { status: 'active' })).text).data
    expect(list).toMatchObject({ total: 1, showing: 'showing 1-1 of 1' })
    expect(list.rows[0]).toMatchObject({ id: 'a1', contentChars: 1_000, contentTruncated: true })
    expect(list.rows[0].content).toHaveLength(300)

    const one = JSON.parse((await run('get_announcement', { announcementId: 'a1' })).text).data
    expect(one.content).toBe(long)
    expect(JSON.parse((await run('get_announcement', { announcementId: 'nope' })).text)).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('pages one section of the affiliate history', async () => {
    jest.mocked(getAffiliateHistory).mockResolvedValue({
      applications: [{ id: 'app-1' }, { id: 'app-2' }],
      blocks: [{ id: 'block-1' }],
    } as never)

    expect(JSON.parse((await run('get_affiliate_history', {})).text).data).toMatchObject({ section: 'applications', total: 2, rows: [{ id: 'app-1' }, { id: 'app-2' }] })
    expect(JSON.parse((await run('get_affiliate_history', { section: 'blocks' })).text).data).toMatchObject({ section: 'blocks', total: 1, rows: [{ id: 'block-1' }] })
  })

  it("pages the request-limit sync's entries", async () => {
    const entries = Array.from({ length: 30 }, (_, index) => ({ userId: `u${index}` }))
    jest.mocked(getRequestTierSettings).mockResolvedValue({ enabled: true, runHour: 3, tiers: [], lastRun: { updated: 30, entries } } as never)

    const data = JSON.parse((await run('get_request_tier_settings', { entriesPage: 2, entriesPageSize: 25 })).text).data

    expect(data.lastRun).toMatchObject({ updated: 30, entries: { total: 30, showing: 'showing 26-30 of 30' } })
    expect(data.lastRun.entries.rows).toHaveLength(5)
  })

  it('returns the settings unchanged before any sync', async () => {
    jest.mocked(getRequestTierSettings).mockResolvedValue({ enabled: false, runHour: 3, tiers: [], lastRun: null })
    expect(JSON.parse((await run('get_request_tier_settings', {})).text).data).toEqual({ enabled: false, runHour: 3, tiers: [], lastRun: null })
  })

  it('refuses bad input', async () => {
    const result = await run('list_users', { year: 'last' })
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.text)).toMatchObject({ code: 'VALIDATION' })
  })

  it('reads a missing row as not found', async () => {
    prismaMock.invite.findUnique.mockResolvedValue(null)
    const result = await run('get_invite', { inviteId: 'nope' })
    expect(JSON.parse(result.text)).toMatchObject({ success: false, code: 'NOT_FOUND' })
  })

  it('throws for anyone below admin, which the server turns into a failure', async () => {
    const member: Session = { user: { id: 'm-1', isAdmin: false, role: null }, expires: '' }
    await expect(run('list_users', {}, member)).rejects.toMatchObject({ digest: expect.any(String) })
  })
})

describe('invites for a read-only token', () => {
  const row = { id: 'inv-1', code: 'ABCD2345', serverType: 'PLEX', useCount: 0, maxUses: 1, expiresAt: null, createdAt: new Date('2026-10-01') }

  beforeEach(() => {
    prismaMock.invite.count.mockResolvedValue(1)
    prismaMock.invite.findMany.mockResolvedValue([row] as never)
  })

  it('shows a full token the code and the link', async () => {
    const data = JSON.parse((await run('list_invites', {})).text).data
    expect(data.rows[0]).toMatchObject({ code: 'ABCD2345', url: 'https://plex.example.com/invite/ABCD2345' })
  })

  it('shows a read token only the last four characters, and no link', async () => {
    const data = JSON.parse((await run('list_invites', {}, admin, 'read')).text).data
    expect(data.rows[0]).toMatchObject({ id: 'inv-1', codeEnd: '2345' })
    expect(data.rows[0]).not.toHaveProperty('code')
    expect(data.rows[0]).not.toHaveProperty('url')
  })
})

describe('an assistant tool', () => {
  it("runs through the assistant's executor with the caller's permissions", async () => {
    jest.mocked(executeToolCall).mockResolvedValue('{"count":0}')

    const result = await run('get_app_invites', { status: 'active' })

    expect(result).toEqual({ text: '{"count":0}', isError: false })
    const [call, userId, context, isAdmin, format, permissions] = jest.mocked(executeToolCall).mock.calls[0]
    expect(call.function).toEqual({ name: 'get_app_invites', arguments: '{"status":"active"}' })
    expect([userId, context, isAdmin, format]).toEqual(['admin-1', undefined, true, { timeZone: 'UTC', locale: 'en-US' }])
    expect(permissions?.has('assistant:tools:admin')).toBe(true)
  })

  it('marks an executor error', async () => {
    jest.mocked(executeToolCall).mockResolvedValue('Error: Unknown tool')
    expect(await run('get_plex_status', {})).toEqual({ text: 'Error: Unknown tool', isError: true })
  })

  it.each(['{"error":"Plex request failed"}', '{"success":false,"error":"tool not permitted"}'])('marks an error reply in JSON, %s', async (reply) => {
    jest.mocked(executeToolCall).mockResolvedValue(reply)
    expect(await run('get_plex_recently_added', {})).toEqual({ text: reply, isError: true })
  })

  it('keeps a reply whose records carry an error field a success', async () => {
    const reply = JSON.stringify({ showing: 'showing 1 of 1', records: [{ title: 'Show', errorMessage: 'stalled' }], error: null })
    jest.mocked(executeToolCall).mockResolvedValue(reply)
    expect(await run('get_sonarr_queue', {})).toEqual({ text: reply, isError: false })
  })

  it('audits an error reply in JSON as a failure', async () => {
    jest.mocked(logAuditEvent).mockClear()
    jest.mocked(executeToolCall).mockResolvedValue('{"error":"Plex request failed"}')

    const response = await handleMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_plex_recently_added', arguments: {} } },
      { tokenId: 'tok-1', scope: 'full', session: admin },
      'req-1'
    )

    expect(response).toMatchObject({ result: { content: [{ text: '{"error":"Plex request failed"}' }], isError: true } })
    expect(logAuditEvent).toHaveBeenCalledWith(
      AuditEventType.MCP_TOOL_CALLED,
      'admin-1',
      expect.objectContaining({ tool: 'get_plex_recently_added', source: 'assistant', ok: false })
    )
  })
})
