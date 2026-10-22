/**
 * @jest-environment node
 */

/**
 * The spinner codemod (P10.15): exact matches only, the size mapping,
 * `Button loading` routed to review, the import, and idempotence.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { main, transformSpinners } from '../spinners'

const ARC = 'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
const spinner = (attributes: string) =>
  `<svg ${attributes} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="${ARC}" /></svg>`
const file = (jsx: string) => `import { cn } from "@/lib/utils"\n\nexport const A = () => (\n  <div>${jsx}</div>\n)\n`
const run = (jsx: string) => transformSpinners('components/a.tsx', file(jsx))

describe('transformSpinners', () => {
  it('replaces a spinner with Spinner, maps the size and keeps the other classes', () => {
    const result = run(spinner('className="animate-spin -ml-1 h-4 w-4 text-white" data-testid="busy"'))
    expect(result.rewritten).toBe(1)
    expect(result.output).toContain('<div><Spinner className="-ml-1 text-white size-4" data-testid="busy" /></div>')
    expect(result.output).toContain('import { cn } from "@/lib/utils"\nimport { Spinner } from "@/components/ui/spinner"\n')
  })

  it('maps size-N and writes no className when only size classes remain', () => {
    expect(run(spinner('className="animate-spin size-5"')).output).toContain('<Spinner className="size-5" />')
    expect(run(spinner('className="animate-spin"')).output).toContain('<Spinner />')
  })

  it('routes a spinner inside a button to Button loading, unchanged', () => {
    for (const tag of ['button', 'Button']) {
      const jsx = `<${tag} disabled={isLoading}>{isLoading ? ${spinner('className="animate-spin h-4 w-4"')} : 'Save'}</${tag}>`
      const result = run(jsx)
      expect(result.output).toBe(file(jsx))
      expect(result.reviews).toEqual([expect.objectContaining({ rule: 'button-loading', file: 'components/a.tsx', line: 4 })])
      expect(result.reviews[0].suggestion).toContain('<Button loading loadingLabel=')
    }
  })

  it('routes a className expression and mismatched sizes to review', () => {
    expect(run(spinner('className={cn("animate-spin", size)}')).reviews[0].rule).toBe('class-expression')
    expect(run(spinner('className="animate-spin h-4 w-5"')).reviews[0].rule).toBe('size')
  })

  it('leaves other SVGs and near-miss paths alone', () => {
    const icon = '<svg className="h-4 w-4"><path d="M5 13l4 4L19 7" /></svg>'
    const nearMiss = '<svg className="h-4 w-4"><path d="M4 12a8 8 0 018-8" /></svg>'
    for (const jsx of [icon, nearMiss]) expect(run(jsx)).toEqual({ output: file(jsx), reviews: [], rewritten: 0 })
  })

  it('reuses an existing Spinner import and is idempotent', () => {
    const source = `import { Spinner } from "@/components/ui/spinner"\n${file(spinner('className="animate-spin h-4 w-4"'))}`
    const once = transformSpinners('components/a.tsx', source).output
    expect(once.match(/import \{ Spinner \}/g)).toHaveLength(1)
    expect(transformSpinners('components/a.tsx', once)).toEqual({ output: once, reviews: [], rewritten: 0 })
  })

  it('adds the import after a "use client" directive when the file has no imports', () => {
    const source = `'use client'\n\nexport const A = () => ${spinner('className="animate-spin h-4 w-4"')}\n`
    expect(transformSpinners('components/a.tsx', source).output).toBe(
      `'use client'\n\nimport { Spinner } from "@/components/ui/spinner"\n\nexport const A = () => <Spinner className="size-4" />\n`
    )
  })
})

describe('main', () => {
  it('dry-runs by default, skips Rewind art and writes with --write', () => {
    const root = mkdtempSync(join(tmpdir(), 'spinners-'))
    for (const dir of ['components/admin', 'components/rewind/pages']) mkdirSync(join(root, dir), { recursive: true })
    const source = file(spinner('className="animate-spin h-4 w-4"'))
    writeFileSync(join(root, 'components/admin/a.tsx'), source)
    writeFileSync(join(root, 'components/rewind/pages/b.tsx'), source)
    const lines: string[] = []

    expect(main([], root, (line) => lines.push(line))).toBe(0)
    expect(lines[0]).toBe('Would rewrite 1 SVGs in 1 of 1 files')
    expect(readFileSync(join(root, 'components/admin/a.tsx'), 'utf8')).toBe(source)
    expect(readFileSync(join(root, 'codemod-spinners-review.md'), 'utf8')).toContain('No review items.')

    expect(main(['--write'], root, () => undefined)).toBe(0)
    expect(readFileSync(join(root, 'components/admin/a.tsx'), 'utf8')).toContain('<Spinner className="size-4" />')
    expect(readFileSync(join(root, 'components/rewind/pages/b.tsx'), 'utf8')).toBe(source)
    expect(main(['--bogus'], root, () => undefined)).toBe(2)
  })
})
