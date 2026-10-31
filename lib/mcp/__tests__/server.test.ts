/**
 * @jest-environment node
 */
import type { Session } from 'next-auth'

import { principalSession } from '@/lib/mcp/principal'
import { handleMessage } from '@/lib/mcp/server'
import type { McpTool } from '@/lib/mcp/types'
import { AuditEventType, logAuditEvent } from '@/lib/security/audit-log'
import { getLogContext } from '@/lib/utils/log-context'

jest.mock('@/lib/security/audit-log', () => ({
  ...jest.requireActual('@/lib/security/audit-log'),
  logAuditEvent: jest.fn(),
}))
jest.mock('@/lib/brand', () => ({ serverName: jest.fn().mockResolvedValue('Northfield Plex') }))

const tools = new Map<string, McpTool>()
jest.mock('@/lib/mcp/catalog', () => ({
  toolsFor: (session: Session) => [...tools.values()].filter((tool) => tool.allowed(session)),
  toolFor: (session: Session, name: string) => {
    const tool = tools.get(name)
    return tool && tool.allowed(session) ? tool : undefined
  },
}))

const session: Session = { user: { id: 'admin-1', name: 'Mike', isAdmin: true, role: null }, expires: '2026-10-31T12:05:00Z' }
const principal = { tokenId: 'tok-1', session }

function tool(name: string, overrides: Partial<McpTool> = {}): McpTool {
  return {
    name,
    description: `${name} tool`,
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    source: 'action',
    allowed: () => true,
    run: jest.fn().mockResolvedValue({ text: '{"success":true}', isError: false }),
    ...overrides,
  }
}

const call = (body: unknown) => handleMessage(body, principal, 'req-1')

beforeEach(() => {
  tools.clear()
  jest.mocked(logAuditEvent).mockClear()
})

describe('initialize', () => {
  it('agrees a supported version and names the owner', async () => {
    const response = await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } })
    expect(response).toMatchObject({
      id: 1,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'plex-manager' },
      },
    })
    const { instructions } = (response as { result: { instructions: string } }).result
    expect(instructions).toContain('Northfield Plex')
    expect(instructions).toContain('acts as Mike')
    expect(instructions).toContain('create_invite')
    expect(instructions).toContain('RESULT_TOO_LARGE')
    expect(instructions.length).toBeLessThan(4096)
  })

  it('answers an unknown version with the newest', async () => {
    const response = await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } })
    expect(response).toMatchObject({ result: { protocolVersion: '2025-06-18' } })
  })
})

it('answers ping', async () => {
  expect(await call({ jsonrpc: '2.0', id: 'p', method: 'ping' })).toEqual({ jsonrpc: '2.0', id: 'p', result: {} })
})

it('answers nothing to a notification', async () => {
  expect(await call({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
})

it.each([
  ['a non-object', 'nope', null],
  ['a batch', [{ jsonrpc: '2.0', id: 1, method: 'ping' }], null],
  ['the wrong version', { jsonrpc: '1.0', id: 3, method: 'ping' }, 3],
])('refuses %s as an invalid request', async (_label, body, id) => {
  expect(await call(body)).toEqual({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid request' } })
})

it('refuses an unknown method', async () => {
  expect(await call({ jsonrpc: '2.0', id: 1, method: 'resources/list' })).toMatchObject({ error: { code: -32601 } })
})

it("lists only the tools the caller may use, without their internals", async () => {
  tools.set('create_invite', tool('create_invite'))
  tools.set('hidden', tool('hidden', { allowed: () => false }))

  const response = await call({ jsonrpc: '2.0', id: 1, method: 'tools/list' })

  expect(response).toEqual({
    jsonrpc: '2.0',
    id: 1,
    result: {
      tools: [
        { name: 'create_invite', description: 'create_invite tool', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
      ],
    },
  })
})

describe('tools/call', () => {
  it("runs the tool as the token's owner, in a log context, and audits it", async () => {
    let seen: { session: Session | undefined; requestId: string | undefined; userId: string | undefined } | null = null
    tools.set(
      'create_invite',
      tool('create_invite', {
        run: async (args) => {
          seen = { session: principalSession(), requestId: getLogContext()?.requestId, userId: getLogContext()?.userId }
          return { text: JSON.stringify(args), isError: false }
        },
      })
    )

    const response = await call({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'create_invite', arguments: { maxUses: 2 } } })

    expect(response).toEqual({ jsonrpc: '2.0', id: 9, result: { content: [{ type: 'text', text: '{"maxUses":2}' }], isError: false } })
    expect(seen).toEqual({ session, requestId: 'req-1', userId: 'admin-1' })
    expect(principalSession()).toBeUndefined()
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.MCP_TOOL_CALLED, 'admin-1', {
      tool: 'create_invite',
      source: 'action',
      credentialId: 'tok-1',
      ok: true,
    })
  })

  it('passes a refusal through as isError', async () => {
    tools.set('t', tool('t', { run: jest.fn().mockResolvedValue({ text: '{"success":false}', isError: true }) }))
    const response = await call({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 't' } })
    expect(response).toMatchObject({ result: { isError: true } })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.MCP_TOOL_CALLED, 'admin-1', expect.objectContaining({ ok: false }))
  })

  it('refuses a result over the size limit, and audits it', async () => {
    tools.set('big', tool('big', { run: jest.fn().mockResolvedValue({ text: 'x'.repeat(40_001), isError: false }) }))

    const response = await call({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'big' } })

    const result = (response as { result: { content: { text: string }[]; isError: boolean } }).result
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0].text)).toMatchObject({ success: false, code: 'RESULT_TOO_LARGE' })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.MCP_TOOL_CALLED, 'admin-1', expect.objectContaining({ ok: false, tooLarge: true }))
  })

  it("lets a tool's own limit through", async () => {
    const text = 'x'.repeat(60_000)
    tools.set('rewind', tool('rewind', { maxResultChars: 120_000, run: jest.fn().mockResolvedValue({ text, isError: false }) }))

    const response = await call({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'rewind' } })

    expect(response).toMatchObject({ result: { content: [{ text }], isError: false } })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.MCP_TOOL_CALLED, 'admin-1', { tool: 'rewind', source: 'action', credentialId: 'tok-1', ok: true })
  })

  it("hides a thrown error's text", async () => {
    tools.set('t', tool('t', { run: jest.fn().mockRejectedValue(new Error('db password is hunter2')) }))
    const response = await call({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 't' } })
    expect(JSON.stringify(response)).not.toContain('hunter2')
    expect(response).toMatchObject({ result: { isError: true } })
  })

  it.each([
    ['an unknown tool', { name: 'nope' }],
    ['a tool the caller may not use', { name: 'hidden' }],
    ['arguments that are not an object', { name: 'hidden', arguments: [1] }],
    ['no name', {}],
  ])('refuses %s without running anything', async (_label, params) => {
    const hidden = tool('hidden', { allowed: () => false })
    tools.set('hidden', hidden)
    const response = await call({ jsonrpc: '2.0', id: 1, method: 'tools/call', params })
    expect(response).toMatchObject({ error: { code: -32602 } })
    expect(hidden.run).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })
})
