/**
 * @jest-environment node
 *
 * Every active-row read of the seven service models is ordered (P11.31,
 * DUP-05): a `findFirst` whose arguments filter on `isActive` must carry an
 * `orderBy`, so two active rows never leave the pick to Postgres. Arguments
 * held in a `const` in the same file are resolved. The one read that is
 * unordered on purpose (the audit's "read today") is marked with an
 * `active-row-order: unordered` comment on the line above.
 */

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const DIRS = ['app', 'actions', 'components', 'evals', 'hooks', 'lib', 'scripts']
const SKIP = new Set(['__tests__', 'generated', 'node_modules', 'dist'])
const CALL = /\.(plexServer|jellyfinServer|tautulli|overseerr|sonarr|radarr|prometheus)\s*\.\s*findFirst(?:OrThrow)?\s*\(/g
const MARKER = 'active-row-order: unordered'

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : sourceFiles(full)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : []
  })
}

/** The text between the bracket at `open` and its match. */
function balanced(source: string, open: number): string {
  const pairs: Record<string, string> = { '(': ')', '{': '}' }
  const close = pairs[source[open]]
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === source[open]) depth++
    else if (source[i] === close && --depth === 0) return source.slice(open + 1, i)
  }
  return source.slice(open + 1)
}

/** The call's arguments with any same-file `const` they name (or spread) appended. */
function resolvedArgs(source: string, args: string): string {
  const names = [...args.matchAll(/(?:^\s*|\.\.\.)([A-Za-z_$][\w$]*)/g)].map((m) => m[1])
  let text = args
  for (const name of names) {
    const decl = new RegExp(`const\\s+${name}\\b[^=]*=\\s*\\{`).exec(source)
    if (decl) text += balanced(source, decl.index + decl[0].length - 1)
  }
  return text
}

/** `file:line` of each `findFirst` on the seven models that filters on `isActive` without an `orderBy`. */
export function unorderedActiveReads(file: string, source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(CALL)) {
    const start = match.index ?? 0
    const args = resolvedArgs(source, balanced(source, start + match[0].length - 1))
    const lines = source.slice(0, start).split('\n')
    if (lines.at(-2)?.includes(MARKER)) continue
    if (/\bisActive\b/.test(args) && !/\borderBy\b/.test(args)) found.push(`${path.relative(ROOT, file)}:${lines.length}`)
  }
  return found
}

describe('active service row reads', () => {
  it('order every findFirst on isActive for the seven service models', () => {
    const offenders = DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir))).flatMap((file) =>
      unorderedActiveReads(file, fs.readFileSync(file, 'utf8'))
    )
    expect(offenders).toEqual([])
  })

  it('catches an inline read, a const read and a spread, and passes an ordered one', () => {
    const source = [
      'const ACTIVE = { where: { isActive: true } } as const',
      'const ORDERED = { where: { isActive: true }, orderBy: { updatedAt: "desc" } } as const',
      'prisma.tautulli.findFirst({ where: { isActive: true } })',
      'prisma.sonarr.findFirst(ACTIVE)',
      'tx.radarr.findFirst({ ...ACTIVE, select: { id: true } })',
      'prisma.plexServer.findFirst(ORDERED)',
      'prisma.overseerr.findFirst({ where: { isActive: true }, orderBy: { updatedAt: "desc" } })',
      'prisma.lLMProvider.findFirst({ where: { isActive: true } })',
      `// ${MARKER}`,
      'prisma.prometheus.findFirst({ where: { isActive: true } })',
    ].join('\n')
    expect(unorderedActiveReads(path.join(ROOT, 'x.ts'), source)).toEqual(['x.ts:3', 'x.ts:4', 'x.ts:5'])
  })
})
