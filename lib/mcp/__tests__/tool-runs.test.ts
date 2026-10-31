/**
 * @jest-environment node
 */

/** What each kind of tool does when called: an action, an admin read and an assistant tool. */

import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { executeToolCall } from '@/lib/chatbot/executors'
import { getAllUsersWithWrapped } from '@/lib/data/admin-users'
import { allTools } from '@/lib/mcp/catalog'
import { runAsPrincipal } from '@/lib/mcp/principal'

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
jest.mock('@/lib/wrapped/season', () => ({ getSeasonState: jest.fn(async () => ({ seasonYear: 2026 })) }))

const admin: Session = { user: { id: 'admin-1', name: 'Mike', isAdmin: true, role: null }, expires: '' }

function run(name: string, args: Record<string, unknown>, session = admin) {
  const tool = allTools().get(name)
  if (!tool) throw new Error(`no tool ${name}`)
  return runAsPrincipal(session, () => tool.run(args, session))
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
    jest.mocked(getAllUsersWithWrapped).mockResolvedValue({ users: [] } as never)
    const result = await run('list_users', {})
    expect(JSON.parse(result.text)).toEqual({ success: true, data: { users: [] } })
    expect(getAllUsersWithWrapped).toHaveBeenCalledWith(2026)
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
})
