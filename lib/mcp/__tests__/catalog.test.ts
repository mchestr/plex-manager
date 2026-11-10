/**
 * @jest-environment node
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import type { Session } from 'next-auth'

import { ACTION_MODULES, EXCLUDED_MODULES } from '@/lib/mcp/action-modules'
import { DESTRUCTIVE_ACTIONS, EXCLUDED, READ_ONLY_ACTIONS, toolName, WRITES_DESPITE_READ_NAME } from '@/lib/mcp/action-tools'
import { ADMIN_READ_TOOLS } from '@/lib/mcp/assistant-tools'
import { allTools, blockedByScope, toolFor, toolsFor } from '@/lib/mcp/catalog'
import { ALL_TOOLS } from '@/lib/chatbot/tools'
import { SKILL_TOOL_NAMES } from '@/lib/chatbot/tools/skills'

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
    expect(raised.sort(([a], [b]) => String(a).localeCompare(String(b)))).toEqual([
      ['get_cleanup_item_why', 60_000],
      ['get_rewind_dry_run', 120_000],
      ['get_user_plex_wrapped', 120_000],
      ['preview_cleanup_rule', 120_000],
    ])
  })

  it('marks as read-only exactly the reviewed actions, and every action named like a read is reviewed', () => {
    const actions = Object.values(ACTION_MODULES).flatMap((module) => Object.keys(module))
    const readNamed = actions.filter((name) => /^(get|list|preview|estimate|discover)[A-Z]/.test(name) && !EXCLUDED[name])
    expect(readNamed.filter((name) => !READ_ONLY_ACTIONS.has(name) && !WRITES_DESPITE_READ_NAME.has(name))).toEqual([])
    expect([...READ_ONLY_ACTIONS].filter((name) => !actions.includes(name))).toEqual([])
    expect([...READ_ONLY_ACTIONS].filter((name) => WRITES_DESPITE_READ_NAME.has(name))).toEqual([])

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

describe('the media cleanup tools', () => {
  const CLEANUP_MODULES = ['admin/cleanup-items', 'admin/cleanup-preview', 'admin/cleanup-protections', 'admin/cleanup-rules', 'admin/cleanup-settings', 'cleanup-keeps']
  const cleanupActions = CLEANUP_MODULES.flatMap((file) => Object.keys(ACTION_MODULES[file] ?? {}))
  const NO_TOOL = ['deleteCleanupBatch', 'turnOnCleanupRule']
  const byName = allTools()

  it('offers every cleanup action module', () => {
    for (const file of CLEANUP_MODULES) expect(Object.keys(ACTION_MODULES[file] ?? {}).length).toBeGreaterThan(0)
    expect(cleanupActions).toEqual(expect.arrayContaining([...NO_TOOL, 'saveCleanupRule', 'keepCleanupTitle', 'startCleanupFirstRead']))
  })

  it('makes every cleanup action a tool, except turning a rule on and approving a deletion batch (E24)', () => {
    expect(cleanupActions.filter((name) => !NO_TOOL.includes(name) && !byName.has(toolName(name)))).toEqual([])
    for (const name of NO_TOOL) {
      expect(EXCLUDED[name]).toBe('a deletion needs a person on the review page')
      expect(byName.has(toolName(name))).toBe(false)
    }
  })

  it('offers no tool that turns a rule on or approves a deletion batch', () => {
    const changes = [...byName.values()].filter((tool) => !tool.annotations.readOnlyHint).map((tool) => tool.name)
    expect(changes.filter((name) => /turn_on|delete_cleanup_batch|approve_cleanup_batch/.test(name))).toEqual([])
    expect(changes.filter((name) => /^approve_cleanup/.test(name))).toEqual(['approve_cleanup_entry_batch'])
    // The turn-on review is a read: it shows what the review page shows
    expect(byName.get('get_cleanup_turn_on')?.annotations).toEqual({ readOnlyHint: true })
  })

  it('lists only real actions as destructive, and gives each the hint (E24)', () => {
    expect([...DESTRUCTIVE_ACTIONS].sort()).toEqual(['approveCleanupEntryBatch', 'resumeCleanup', 'saveCleanupRule', 'setCleanupExclusionEnd', 'updateCleanupSettings'])
    for (const name of DESTRUCTIVE_ACTIONS) {
      expect(cleanupActions).toContain(name)
      expect([name, byName.get(toolName(name))?.annotations]).toEqual([name, { readOnlyHint: false, destructiveHint: true }])
    }
  })

  it.each(['delete_cleanup_rule', 'remove_cleanup_keep', 'remove_cleanup_exclusion', 'remove_my_cleanup_keep'])('%s is destructive by its name (X5)', (name) => {
    expect(byName.get(name)?.annotations).toEqual({ readOnlyHint: false, destructiveHint: true })
  })

  it('marks the other cleanup writes as writes that are not destructive', () => {
    const writes = ['create_cleanup_rule', 'create_cleanup_rule_from_recipe', 'duplicate_cleanup_rule', 'set_cleanup_rule_review_first', 'move_cleanup_rule_to_dry_run',
      'run_cleanup_rule_dry_run', 'postpone_cleanup_items', 'exclude_cleanup_items', 'pause_cleanup', 'run_cleanup_now', 'refresh_cleanup_data', 'start_cleanup_first_read', 'keep_cleanup_title']
    for (const name of writes) expect([name, byName.get(name)?.annotations]).toEqual([name, { readOnlyHint: false, destructiveHint: false }])
  })

  it('marks the four previews and the batch selection read only', () => {
    const reads = ['preview_cleanup_rule', 'preview_cleanup_recipe', 'preview_cleanup_protection_impact', 'get_cleanup_item_why', 'get_cleanup_batch_selection']
    for (const name of reads) expect([name, byName.get(name)?.annotations]).toEqual([name, { readOnlyHint: true }])
  })

  it.each(['postpone_cleanup_items', 'exclude_cleanup_items'])('%s takes itemKeys or the batch form in one object schema (E37)', (name) => {
    const schema = byName.get(name)?.inputSchema as { type?: string; properties?: Record<string, { type?: string; properties?: Record<string, unknown> }> }
    expect(schema.type).toBe('object')
    expect(Object.keys(schema.properties ?? {})).toEqual(expect.arrayContaining(['itemKeys', 'batch']))
    expect(schema.properties?.input).toBeUndefined()
    expect(Object.keys(schema.properties?.batch?.properties ?? {})).toEqual(expect.arrayContaining(['batchId', 'count', 'keysHash', 'excludeKeys', 'selectedCount']))
  })

  it('offers the eight cleanup read tools, read only and admin only, with paging on the lists', () => {
    const reads = ['get_cleanup_overview', 'get_cleanup_rule', 'get_cleanup_turn_on', 'list_cleanup_leaving_soon', 'list_cleanup_protections', 'list_cleanup_runs', 'list_cleanup_deleted', 'get_cleanup_settings']
    for (const name of reads) {
      const tool = byName.get(name)
      expect([name, tool?.source, tool?.annotations]).toEqual([name, 'loader', { readOnlyHint: true }])
      expect(tool?.allowed(support)).toBe(false)
      expect(tool?.allowed(admin)).toBe(true)
    }
    for (const name of ['get_cleanup_overview', 'list_cleanup_leaving_soon', 'list_cleanup_protections', 'list_cleanup_deleted']) {
      expect(JSON.stringify(byName.get(name)?.inputSchema)).toMatch(/pageSize/)
    }
  })

  it('names only real tools in the cleanup read tool descriptions', () => {
    const named = toolNamesIn(['get_cleanup_overview', 'get_cleanup_rule', 'get_cleanup_turn_on', 'list_cleanup_leaving_soon', 'list_cleanup_protections', 'get_cleanup_settings'].map((name) => byName.get(name)?.description ?? ''))
    expect(named.length).toBeGreaterThan(5)
    expect(named.filter((name) => !byName.has(name))).toEqual([])
  })

  it('gives a member only their own Keep tools', () => {
    const names = toolsFor(member, 'full').map((tool) => tool.name).filter((name) => name.includes('cleanup'))
    expect(names.sort()).toEqual(['keep_cleanup_title', 'remove_my_cleanup_keep'])
  })

  it('gives a read-only token the cleanup reads and no cleanup change', () => {
    const names = toolsFor(admin, 'read').map((tool) => tool.name).filter((name) => name.includes('cleanup'))
    expect(names).toEqual(expect.arrayContaining(['get_cleanup_rule', 'list_cleanup_leaving_soon', 'preview_cleanup_rule', 'get_cleanup_batch_selection']))
    for (const name of ['save_cleanup_rule', 'approve_cleanup_entry_batch', 'update_cleanup_settings', 'resume_cleanup', 'postpone_cleanup_items']) expect(names).not.toContain(name)
  })

  it('tells clients in the server instructions that a person turns rules on and approves deletions', () => {
    const source = readFileSync(join(ROOT, 'lib/mcp/server.ts'), 'utf8')
    expect(source).toContain('Turning a cleanup rule on and approving a deletion batch need a person on the admin pages: no tool does them.')
    expect(source).toContain('Ask a person to check each cleanup change that a tool marks destructive.')
    // Both coverage lists, the read-only one and the full one
    expect(source.split('media cleanup (rules, previews, Leaving soon').length - 1).toBe(2)
  })
})

/** The snake-case tool names that some text names. */
function toolNamesIn(texts: string[]): string[] {
  return [...new Set(texts.join(' ').match(/\b(?:create|list|get|delete|set|remove|approve|save|update|postpone|exclude|preview)_[a-z_]+\b/g) ?? [])]
}

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

describe('the assistant tools', () => {
  // The skill tools are for the admin web chat only, so they are not MCP tools at all
  const offered = ALL_TOOLS.filter((tool) => !SKILL_TOOL_NAMES.has(tool.function.name))

  it('marks as read-only the read tier and exactly the listed admin-tier reads, so a new admin tool is reviewed', () => {
    const adminTier = offered.filter((tool) => tool.permission === 'assistant:tools:admin').map((tool) => tool.function.name)
    expect(adminTier.sort()).toEqual([...ADMIN_READ_TOOLS].sort())
    for (const tool of offered) {
      const readOnly = tool.permission === 'assistant:tools:read' || ADMIN_READ_TOOLS.has(tool.function.name)
      expect([tool.function.name, allTools().get(tool.function.name)?.annotations.readOnlyHint]).toEqual([tool.function.name, readOnly])
    }
  })

  it('skill tools are not MCP tools', () => {
    expect(allTools().has('load_skill')).toBe(false)
    expect(allTools().has('read_skill_file')).toBe(false)
  })
})

describe('a read-only token', () => {
  const read = toolsFor(admin, 'read')
  const names = read.map((tool) => tool.name)

  it('cannot reach a change by name, and is told why', () => {
    expect(toolFor(admin, 'create_invite', 'read')).toBeUndefined()
    expect(toolFor(admin, 'list_users', 'read')?.name).toBe('list_users')
    expect(blockedByScope(admin, 'create_invite', 'read')).toBe(true)
    expect(blockedByScope(admin, 'create_invite', 'full')).toBe(false)
    expect(blockedByScope(admin, 'no_such_tool', 'read')).toBe(false)
    expect(blockedByScope(member, 'create_invite', 'read')).toBe(false)
  })

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

it('names only real tools in the server instructions', () => {
  const source = readFileSync(join(ROOT, 'lib/mcp/server.ts'), 'utf8')
  const named = [...new Set(source.match(/\b(?:create|list|get|delete|set|remove)_[a-z_]+\b/g) ?? [])]
  expect(named.length).toBeGreaterThan(5)
  expect(named.filter((name) => !allTools().has(name))).toEqual([])
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
