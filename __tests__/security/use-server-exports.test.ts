/**
 * @jest-environment node
 */

/**
 * Every export of a `'use server'` module is a public endpoint, so each one
 * must be built by `defineAction` (or `formAction`) and carry its brand
 * (P11.5, BP-06). A raw read helper exported from such a module fails here.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { actionAuthOf, isBrandedAction } from '@/lib/actions/define-action'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

const ROOT = join(__dirname, '..', '..')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === '__tests__' || name === 'generated' || name === 'node_modules') return []
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : []
  })
}

/** Modules whose first statement is the `'use server'` directive. */
const useServerModules = ['actions', 'lib']
  .flatMap((dir) => walk(join(ROOT, dir)))
  .filter((path) => /^\s*(?:\/\/[^\n]*\n\s*)*["']use server["']/.test(readFileSync(path, 'utf8')))
  .map((path) => relative(ROOT, path))
  .sort()

it('finds the action modules', () => {
  expect(useServerModules.length).toBeGreaterThan(20)
  expect(useServerModules).toContain('actions/admin/queue.ts')
})

describe.each(useServerModules)('%s', (path) => {
  it('exports only branded actions', () => {
    const exports = jest.requireActual<Record<string, unknown>>(join(ROOT, path))
    const unbranded = Object.entries(exports)
      .filter(([, value]) => !isBrandedAction(value))
      .map(([name]) => name)

    expect(unbranded).toEqual([])
  })
})

describe.each(useServerModules)('%s auth', (path) => {
  it('declares what every action requires of its caller', () => {
    const exports = jest.requireActual<Record<string, unknown>>(join(ROOT, path))
    const undeclared = Object.entries(exports)
      .filter(([, value]) => !/^(public|member|admin|setup|permission:[a-z:]+)$/.test(actionAuthOf(value) ?? ''))
      .map(([name]) => name)

    expect(undeclared).toEqual([])
  })
})

it('records the permission of the actions that need one', () => {
  const { chatWithAdminBot, deleteAssistantConversation } = jest.requireActual<Record<string, unknown>>(join(ROOT, 'actions/chatbot/index.ts'))

  expect(actionAuthOf(chatWithAdminBot)).toBe('permission:assistant:use')
  expect(actionAuthOf(deleteAssistantConversation)).toBe('permission:assistant:use')
})
