/**
 * @jest-environment node
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import type { Session } from 'next-auth'

import { ACTION_MODULES, EXCLUDED_MODULES } from '@/lib/mcp/action-modules'
import { EXCLUDED, READ_ONLY_ACTIONS, toolName } from '@/lib/mcp/action-tools'
import { allTools, toolsFor } from '@/lib/mcp/catalog'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

const ROOT = join(__dirname, '..', '..', '..')

function actionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === '__tests__') return []
    const path = join(dir, name)
    return statSync(path).isDirectory() ? actionFiles(path) : name.endsWith('.ts') ? [path] : []
  })
}

const admin: Session = { user: { id: 'a', isAdmin: true, role: null }, expires: '' }
const support: Session = { user: { id: 's', isAdmin: false, role: 'support' }, expires: '' }
const member: Session = { user: { id: 'm', isAdmin: false, role: null }, expires: '' }

describe('the catalog', () => {
  const tools = [...allTools().values()]

  it('lists every actions file as a tool module or a left-out one', () => {
    const files = actionFiles(join(ROOT, 'actions')).map((path) => relative(join(ROOT, 'actions'), path).replace(/\.ts$/, ''))
    const listed = [...Object.keys(ACTION_MODULES), ...Object.keys(EXCLUDED_MODULES)]
    expect(files.filter((file) => !listed.includes(file))).toEqual([])
    expect(listed.filter((file) => !files.includes(file))).toEqual([])
  })

  it('reads every left-out action file without offering any of its actions', () => {
    const names = new Set(tools.map((tool) => tool.name))
    for (const file of Object.keys(EXCLUDED_MODULES)) {
      const source = readFileSync(join(ROOT, 'actions', `${file}.ts`), 'utf8')
      for (const [, exportName] of source.matchAll(/export const (\w+)/g)) {
        expect(names.has(toolName(exportName))).toBe(false)
      }
    }
  })

  it('names only actions that exist in its exclusions', () => {
    const exported = new Set(Object.values(ACTION_MODULES).flatMap((module) => Object.keys(module)))
    expect(Object.keys(EXCLUDED).filter((name) => !exported.has(name))).toEqual([])
  })

  it('offers the invite, user and setting tools', () => {
    const names = tools.map((tool) => tool.name)
    expect(names).toEqual(expect.arrayContaining(['create_invite', 'delete_invite', 'list_invites', 'list_users', 'set_user_role', 'update_rewind_settings', 'get_app_member']))
    expect(names).not.toEqual(expect.arrayContaining(['chat_with_admin_bot']))
    expect(names).not.toContain('create_api_token')
    expect(names).not.toContain('claim_server')
  })

  it.each(tools.map((tool) => [tool.name, tool] as const))('%s has a description and an object schema', (_name, tool) => {
    expect(tool.name).toMatch(/^[a-z][a-z0-9_]{1,63}$/)
    expect(tool.description.length).toBeGreaterThan(10)
    expect(tool.inputSchema.type).toBe('object')
    expect(() => JSON.stringify(tool.inputSchema)).not.toThrow()
  })

  it('offers the paged reads and their one-row reads', () => {
    const names = tools.map((tool) => tool.name)
    expect(names).toEqual(expect.arrayContaining(['get_llm_usage', 'get_announcement']))
    for (const name of ['list_users', 'list_llm_usage', 'list_announcements', 'list_affiliates', 'get_affiliate_history']) {
      expect(JSON.stringify(allTools().get(name)?.inputSchema)).toMatch(/pageSize/)
    }
  })

  it('lets only whole-record reads past the default result limit', () => {
    const raised = tools.filter((tool) => tool.maxResultChars !== undefined).map((tool) => [tool.name, tool.maxResultChars])
    expect(raised).toEqual([
      ['get_rewind_dry_run', 120_000],
      ['get_user_plex_wrapped', 120_000],
    ])
  })

  it('marks as read-only exactly the reviewed actions, and every action named like a read is reviewed', () => {
    const actions = Object.values(ACTION_MODULES).flatMap((module) => Object.keys(module))
    const readNamed = actions.filter((name) => /^(get|list|preview|estimate|discover)[A-Z]/.test(name) && !EXCLUDED[name])
    expect(readNamed.filter((name) => !READ_ONLY_ACTIONS.has(name))).toEqual([])
    expect([...READ_ONLY_ACTIONS].filter((name) => !actions.includes(name))).toEqual([])

    const readOnlyActionTools = tools.filter((tool) => tool.source === 'action' && tool.annotations.readOnlyHint).map((tool) => tool.name).sort()
    expect(readOnlyActionTools).toEqual([...READ_ONLY_ACTIONS].map(toolName).sort())
  })

  it('marks reads read-only and deletes destructive', () => {
    const byName = allTools()
    expect(byName.get('list_invites')?.annotations).toEqual({ readOnlyHint: true })
    expect(byName.get('get_rewind_season_status')?.annotations.readOnlyHint).toBe(true)
    expect(byName.get('delete_invite')?.annotations).toEqual({ readOnlyHint: false, destructiveHint: true })
    expect(byName.get('create_invite')?.annotations).toEqual({ readOnlyHint: false, destructiveHint: false })
  })
})

describe('toolsFor', () => {
  it('gives an admin every tool', () => {
    expect(toolsFor(admin, 'full')).toHaveLength(allTools().size)
  })

  it("gives a role only its permissions' assistant tools and the member's own actions", () => {
    const names = toolsFor(support, 'full').map((tool) => tool.name)
    expect(names).toContain('get_plex_status')
    expect(names).toContain('delete_assistant_conversation')
    expect(names).not.toContain('create_invite')
    expect(names).not.toContain('list_users')
    expect(names).not.toContain('get_app_member')
  })

  it('gives a member no admin tool', () => {
    const tools = toolsFor(member, 'full')
    expect(tools.map((tool) => tool.name)).toContain('request_rewind_generation')
    expect(tools.every((tool) => tool.source === 'action')).toBe(true)
    expect(tools.map((tool) => tool.name)).not.toContain('create_invite')
  })
})

describe('a read-only token', () => {
  const read = toolsFor(admin, 'read')
  const names = read.map((tool) => tool.name)

  it('gets only the tools that read', () => {
    expect(read.every((tool) => tool.annotations.readOnlyHint)).toBe(true)
    expect(names).toEqual(expect.arrayContaining(['list_users', 'list_invites', 'get_admin_settings', 'get_plex_status', 'get_rewind_status', 'preview_member_removal']))
  })

  it('gets no tool that changes something', () => {
    for (const name of ['create_invite', 'delete_invite', 'remove_member', 'set_user_role', 'update_rewind_settings', 'mark_media_finished', 'save_plex_server']) {
      expect(names).not.toContain(name)
    }
  })
})

describe('toolName', () => {
  it.each([
    ['createInvite', 'create_invite'],
    ['saveLLMProvider', 'save_llm_provider'],
    ['listLLMModels', 'list_llm_models'],
    ['updateLlmCaps', 'update_llm_caps'],
  ])('%s -> %s', (exportName, name) => {
    expect(toolName(exportName)).toBe(name)
  })
})
