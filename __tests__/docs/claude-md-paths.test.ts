/**
 * @jest-environment node
 *
 * Every repository path CLAUDE.md names in inline code must exist, because
 * every agent session reads that file (GAP-22, P1.2). README.md and every
 * `docs/*.md` are held to the same rule, and every `npm run` script either
 * file names must exist in package.json (P11.26).
 *
 * Checked: inline-code spans outside fenced blocks that start with one of the
 * source roots below, or with the `@/` alias (resolved like an import). Not
 * checked: fenced code blocks (sample code and the file tree) and glob patterns
 * such as `app/**`, which may name folders that later steps create.
 */

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const ROOTS = ['app', 'actions', 'components', 'lib', 'types', 'prisma', 'docs', 'e2e', 'scripts', 'hooks', 'deploy']
// README and every operator doc (P11.24, P11.26) are held to the same rule.
const DOCS = [
  'README.md',
  ...fs
    .readdirSync(path.join(ROOT, 'docs'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `docs/${name}`),
]
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

describe('README and docs paths', () => {
  it.each(DOCS)('every repository path %s names exists', (doc) => {
    const paths = repositoryPaths(fs.readFileSync(path.join(ROOT, doc), 'utf8'))
    expect(paths.filter((repoPath) => !exists(repoPath))).toEqual([])
  })

  it('checks the paths the deployment guide names', () => {
    const paths = repositoryPaths(fs.readFileSync(path.join(ROOT, 'docs/deployment.md'), 'utf8'))
    expect(paths).toContain('deploy/docker-compose.yml')
  })
})

describe('npm scripts named in README.md and CLAUDE.md', () => {
  const scripts = Object.keys(
    (JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts,
  )

  it.each(['README.md', 'CLAUDE.md'])('every `npm run` script in %s exists', (file) => {
    const markdown = fs.readFileSync(path.join(ROOT, file), 'utf8')
    const named = Array.from(new Set(Array.from(markdown.matchAll(/npm run ([a-z0-9:-]+)/g), (match) => match[1])))
    expect(named.length).toBeGreaterThan(0)
    expect(named.filter((script) => !scripts.includes(script))).toEqual([])
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
