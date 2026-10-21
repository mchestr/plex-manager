/**
 * @jest-environment node
 *
 * Every repository path CLAUDE.md names in inline code must exist, because
 * every agent session reads that file (GAP-22, P1.2).
 *
 * Checked: inline-code spans outside fenced blocks that start with one of the
 * source roots below, or with the `@/` alias (resolved like an import). Not
 * checked: fenced code blocks (sample code and the file tree) and glob patterns
 * such as `app/**`, which may name folders that later steps create.
 */

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const ROOTS = ['app', 'actions', 'components', 'lib', 'types', 'prisma', 'docs', 'e2e', 'scripts', 'hooks']
// `.js` covers `@/lib/generated/prisma/client`, which `prisma generate` writes.
const IMPORT_EXTENSIONS = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx']

function inlineCodeSpans(markdown: string): string[] {
  const withoutFences = markdown.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, '')
  return Array.from(withoutFences.matchAll(/`([^`\n]+)`/g), (match) => match[1].trim())
}

function repositoryPaths(markdown: string): string[] {
  const paths = inlineCodeSpans(markdown)
    .filter((span) => !/[\s*{}<>]/.test(span))
    .filter((span) => span.startsWith('@/') || ROOTS.some((root) => span === root || span.startsWith(`${root}/`)))
  return Array.from(new Set(paths))
}

function exists(repoPath: string): boolean {
  if (repoPath.startsWith('@/')) {
    const target = repoPath.slice(2)
    return IMPORT_EXTENSIONS.some((ext) => fs.existsSync(path.join(ROOT, target + ext)))
  }
  return fs.existsSync(path.join(ROOT, repoPath))
}

describe('CLAUDE.md paths', () => {
  const markdown = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8')
  const paths = repositoryPaths(markdown)

  it('finds the paths it is meant to check', () => {
    expect(paths).toEqual(expect.arrayContaining(['lib/wrapped/archetypes/scorers.ts', '@/lib/security/rate-limit']))
  })

  it.each(paths)('%s exists', (repoPath) => {
    expect(exists(repoPath)).toBe(true)
  })
})

describe('path extraction', () => {
  it('skips fenced blocks and globs, and keeps alias and root paths', () => {
    const sample = [
      'See `lib/a.ts`, `@/lib/b` and `app/**`, but not `npm test`.',
      '```ts',
      "import { c } from '@/lib/c' // `lib/c.ts`",
      '```',
      'And `docs/x.md`.',
    ].join('\n')

    expect(repositoryPaths(sample)).toEqual(['lib/a.ts', '@/lib/b', 'docs/x.md'])
  })
})
