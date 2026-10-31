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
// The catalog's rule (lib/mcp/__tests__/catalog.test.ts): the session's tools, and with a read token only those that read
const usable = (tool: McpTool, session: Session, scope: string) => tool.allowed(session) && (scope === 'full' || tool.annotations.readOnlyHint)
jest.mock('@/lib/mcp/catalog', () => ({
  toolsFor: (session: Session, scope: string) => [...tools.values()].filter((tool) => usable(tool, session, scope)),
  toolFor: (session: Session, name: string, scope: string) => {
    const tool = tools.get(name)
    return tool && usable(tool, session, scope) ? tool : undefined
  },
  blockedByScope: (session: Session, name: string, scope: string) => {
    const tool = tools.get(name)
    return Boolean(tool && tool.allowed(session) && !usable(tool, session, scope))
  },
}))

const session: Session = { user: { id: 'admin-1', name: 'Mike', isAdmin: true, role: null }, expires: '2026-10-31T12:05:00Z' }
const principal = { tokenId: 'tok-1', scope: 'full' as const, session }
const readPrincipal = { ...principal, scope: 'read' as const }

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

  it("keeps a change's outcome when its result is too large, so a client does not retry it", async () => {
    tools.set('import', tool('import', { annotations: { readOnlyHint: false }, run: jest.fn().mockResolvedValue({ text: 'x'.repeat(40_001), isError: false }) }))

    const response = await call({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'import' } })

    const result = (response as { result: { content: { text: string }[]; isError: boolean } }).result
    expect(result.isError).toBe(false)
    expect(JSON.parse(result.content[0].text)).toMatchObject({ success: true, resultOmitted: true })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.MCP_TOOL_CALLED, 'admin-1', expect.objectContaining({ ok: true, tooLarge: true }))
  })

  it('redacts a credential in a result', async () => {
    const text = JSON.stringify({ success: true, data: { sonarr: { url: 'http://sonarr.lan', apiKey: 'raw-sonarr-key' } } })
    tools.set('leaky', tool('leaky', { run: jest.fn().mockResolvedValue({ text, isError: false }) }))

    const response = await call({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'leaky' } })

    const result = (response as { result: { content: { text: string }[] } }).result
    expect(result.content[0].text).not.toContain('raw-sonarr-key')
    expect(JSON.parse(result.content[0].text).data.sonarr).toEqual({ url: 'http://sonarr.lan', apiKey: '[redacted]' })
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

describe('a read-only token', () => {
  const readCall = (body: unknown) => handleMessage(body, readPrincipal, 'req-1')

  beforeEach(() => {
    tools.set('list_users', tool('list_users'))
    tools.set('create_invite', tool('create_invite', { annotations: { readOnlyHint: false, destructiveHint: false } }))
  })

  it('lists only the tools that read, and says so', async () => {
    const list = await readCall({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect((list as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name)).toEqual(['list_users'])

    const init = await readCall({ jsonrpc: '2.0', id: 2, method: 'initialize', params: {} })
    const { instructions } = (init as { result: { instructions: string } }).result
    expect(instructions).toContain('This token is read-only')
    expect(instructions).not.toMatch(/create_invite|remove_member|set_user_role/)
  })

  it('refuses a tool that changes something without running it', async () => {
    const response = await readCall({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_invite' } })
    expect(response).toMatchObject({ error: { code: -32602, message: 'create_invite changes something, and this token is read-only' } })
    expect(tools.get('create_invite')?.run).not.toHaveBeenCalled()
  })

  it('runs a tool that reads, telling it the caller is read-only', async () => {
    const response = await readCall({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_users' } })
    expect(response).toMatchObject({ result: { isError: false } })
    expect(tools.get('list_users')?.run).toHaveBeenCalledWith({}, { session, scope: 'read' })
  })

  it('still calls an unknown name unknown', async () => {
    const response = await readCall({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nope' } })
    expect(response).toMatchObject({ error: { code: -32602, message: 'Unknown tool: nope' } })
  })
})
