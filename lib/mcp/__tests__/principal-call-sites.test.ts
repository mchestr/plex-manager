/**
 * @jest-environment node
 */

/**
 * `getSession()` returns the MCP principal first (lib/mcp/principal.ts), so
 * code run inside `runAsPrincipal` acts as the token's owner. Only the MCP
 * server may start such a run, after it has checked the token.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..')
const SKIP = new Set(['__tests__', 'node_modules', 'generated', '.next'])

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return []
    const path = join(dir, name)
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : []
  })
}

it('runs tools as a principal only from the MCP server', () => {
  const callers = ['app', 'actions', 'components', 'hooks', 'lib', 'proxy.ts', 'instrumentation.ts']
    .flatMap((entry) => {
      const path = join(ROOT, entry)
      try {
        return statSync(path).isDirectory() ? sources(path) : [path]
      } catch {
        return []
      }
    })
    .filter((path) => /\brunAsPrincipal\b/.test(readFileSync(path, 'utf8')))
    .map((path) => relative(ROOT, path))
    .sort()

  expect(callers).toEqual(['lib/mcp/principal.ts', 'lib/mcp/server.ts'])
})
