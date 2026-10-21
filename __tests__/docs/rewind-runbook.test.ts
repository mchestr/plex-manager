/**
 * @jest-environment node
 *
 * `docs/rewind.md` is the operator's runbook for the season (P7.17), so it
 * must name every Rewind flag an admin can set, every cut key and, once P8.3
 * adds them, every P1 feature flag, and every repository path it names must
 * exist.
 *
 * Blockquotes are reserved for **Pending** sections, which describe steps that
 * have not merged; their paths are checked once the step fills the section in
 * and drops the blockquote.
 */

import fs from 'fs'
import path from 'path'

import { REWIND_CUT_PAGES, rewindSettingsSchema } from '@/lib/validations/rewind-settings'

const ROOT = path.resolve(__dirname, '../..')
const ROOTS = ['app', 'actions', 'components', 'lib', 'types', 'prisma', 'docs', 'e2e', 'scripts', 'hooks', 'evals']
const runbook = fs.readFileSync(path.join(ROOT, 'docs/rewind.md'), 'utf8')

/** Inline-code spans outside fenced blocks and outside blockquotes (Pending sections). */
function checkedSpans(markdown: string): string[] {
  const body = markdown
    .replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('>'))
    .join('\n')
  return Array.from(body.matchAll(/`([^`\n]+)`/g), (match) => match[1].trim())
}

function repositoryPaths(markdown: string): string[] {
  const paths = checkedSpans(markdown)
    .filter((span) => !/[\s*<>{}]/.test(span))
    .filter((span) => ROOTS.some((root) => span.startsWith(`${root}/`)))
  return Array.from(new Set(paths))
}

describe('docs/rewind.md', () => {
  it.each(Object.keys(rewindSettingsSchema.shape))('names the flag %s', (flag) => {
    expect(runbook).toContain(`\`${flag}\``)
  })

  it.each(REWIND_CUT_PAGES.map((page) => page.key))('names the cut key %s', (key) => {
    expect(runbook).toContain(`\`${key}\``)
  })

  it('names every P1 feature flag once lib/rewind/features.ts exists', async () => {
    const features = path.join(ROOT, 'lib/rewind/features.ts')
    if (!fs.existsSync(features)) return
    const mod: { REWIND_FEATURES?: Record<string, unknown> } = await import(features)
    const keys = Object.keys(mod.REWIND_FEATURES ?? {})
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) expect(runbook).toContain(`\`${key}\``)
  })

  it('covers the requirements, the season open, roll back and the final cut', () => {
    for (const heading of ['## Requirements', '## Season open, hour by hour', '## Roll back', '## The final cut', '## Error and skip codes']) {
      expect(runbook).toContain(heading)
    }
    expect(runbook).toContain('Tautulli 2.17 or later')
    expect(runbook).toContain('CVE-2026-31799')
  })

  const paths = repositoryPaths(runbook)

  it('finds the paths it is meant to check', () => {
    expect(paths).toEqual(expect.arrayContaining(['app/admin/rewind/page.tsx', 'lib/validations/rewind-settings.ts']))
  })

  it.each(paths)('%s exists', (repoPath) => {
    expect(fs.existsSync(path.join(ROOT, repoPath))).toBe(true)
  })
})
