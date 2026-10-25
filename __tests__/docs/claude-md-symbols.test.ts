/**
 * @jest-environment node
 *
 * Every function a CLAUDE.md Integration Patterns snippet calls (`name(`) is
 * imported in that snippet from an `@/` module that exports it, so an agent
 * that copies a snippet only uses APIs that exist (GAP-22, P11.26).
 *
 * Calls after a `.` (methods such as `prisma.tautulli.findFirst(`) are not
 * checked. The module's source is read as text: a name counts as exported
 * when it is declared with `export` or listed in an `export { ... }` block,
 * which covers barrels such as `lib/connections/plex.ts`.
 */

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof', 'await', 'async'])

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n${heading}\n`)
  if (start === -1) throw new Error(`Heading not found: ${heading}`)
  const end = markdown.indexOf('\n## ', start + 1)
  return markdown.slice(start, end === -1 ? undefined : end)
}

function snippets(markdown: string): string[] {
  return Array.from(markdown.matchAll(/^```typescript\n([\s\S]*?)^```/gm), (match) => match[1])
}

/** Imported name -> module specifier, for `@/` imports. */
function imports(snippet: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of snippet.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(@\/[^']+)'/g)) {
    for (const name of match[1].split(',').map((part) => part.trim().replace(/^type\s+/, ''))) {
      if (name) found.set(name.split(/\s+as\s+/).pop() ?? name, match[2])
    }
  }
  return found
}

function calls(snippet: string): string[] {
  const code = snippet.replace(/\/\/.*$/gm, '')
  const names = Array.from(code.matchAll(/(?<![.\w])([A-Za-z_$][\w$]*)\(/g), (match) => match[1])
  return Array.from(new Set(names.filter((name) => !KEYWORDS.has(name))))
}

function moduleSource(specifier: string): string {
  const base = path.join(ROOT, specifier.slice(2))
  const file = ['.ts', '.tsx', '/index.ts'].map((ext) => base + ext).find((candidate) => fs.existsSync(candidate))
  if (!file) throw new Error(`No module for ${specifier}`)
  return fs.readFileSync(file, 'utf8')
}

function exportsName(source: string, name: string): boolean {
  const declared = new RegExp(`export\\s+(async\\s+)?(function|const|class|let)\\s+${name}\\b`)
  const listed = new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`)
  return declared.test(source) || listed.test(source)
}

const markdown = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8')
const blocks = snippets(section(markdown, '## Integration Patterns'))

const cases = blocks.flatMap((snippet) => {
  const imported = imports(snippet)
  return calls(snippet).map((name) => ({ name, module: imported.get(name) ?? null }))
})

describe('CLAUDE.md Integration Patterns symbols', () => {
  it('finds the snippets and calls it is meant to check', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(5)
    expect(cases.map((c) => c.name)).toEqual(
      expect.arrayContaining(['getActivePlexServerConfig', 'tautulliCommand', 'buildOverseerrUserIndex', 'generateStructured', 'getStripe']),
    )
  })

  it.each(cases)('$name is imported from an @/ module that exports it', ({ name, module }) => {
    expect(module).not.toBeNull()
    expect(exportsName(moduleSource(module ?? ''), name)).toBe(true)
  })
})
