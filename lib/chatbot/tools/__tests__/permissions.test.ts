jest.mock('server-only', () => ({}))

import { ALL_TOOLS, toolsForPermissions } from '@/lib/chatbot/tools'
import { permissionsFor } from '@/lib/permissions'

describe('tool permissions', () => {
  it('has every tool declare read or write', () => {
    for (const tool of ALL_TOOLS) {
      expect([tool.function.name, tool.permission]).toEqual([tool.function.name, expect.stringMatching(/^assistant:tools:(read|write)$/)])
    }
  })

  it('classifies media marking as write and the service lookups as read', () => {
    const write = ALL_TOOLS.filter((tool) => tool.permission === 'assistant:tools:write').map((tool) => tool.function.name)

    expect(write.sort()).toEqual(['mark_media_finished', 'mark_media_keep'])
  })

  it('gives an admin every tool', () => {
    expect(toolsForPermissions(permissionsFor({ isAdmin: true }))).toHaveLength(ALL_TOOLS.length)
  })

  it('gives Support the read tools and no write tool', () => {
    const tools = toolsForPermissions(permissionsFor({ isAdmin: false, role: 'support' }))

    expect(tools.length).toBeGreaterThan(0)
    expect(tools.every((tool) => tool.permission === 'assistant:tools:read')).toBe(true)
    expect(tools.map((tool) => tool.function.name)).not.toContain('mark_media_finished')
  })

  it('gives a caller without permissions no tool', () => {
    expect(toolsForPermissions(new Set())).toEqual([])
  })
})
