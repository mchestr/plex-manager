/**
 * @jest-environment node
 */

/**
 * The icon codemod (P10.15): exact matches only, the size snapping, label
 * retention, the review list grouped by path, the imports and idempotence.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { main, transformIcons } from '../icons'

const CHECK = 'M5 13l4 4L19 7'
const svg = (attributes: string, d = CHECK, extra = '') =>
  `<svg ${attributes} fill="none" viewBox="0 0 24 24" stroke="currentColor">${extra}<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="${d}" /></svg>`
const file = (jsx: string) => `import { cn } from "@/lib/utils"\n\nexport const A = () => <span>${jsx}</span>\n`
const run = (jsx: string) => transformIcons('components/a.tsx', file(jsx))
const body = (jsx: string) => /<span>(.*)<\/span>/.exec(run(jsx).output)?.[1]

describe('transformIcons', () => {
  it.each([
    [CHECK, 'done'],
    ['M19 9l-7 7-7-7', 'chevronDown'],
    ['M9 5l7 7-7 7', 'chevronRight'],
    ['M15 19l-7-7 7-7', 'chevronLeft'],
    ['M6 18L18 6M6 6l12 12', 'close'],
    [
      'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
      'warning',
    ],
  ])('maps %s to icons.%s', (d, concept) => {
    expect(body(svg('className="h-4 w-4"', d))).toBe(`<Icon icon={icons.${concept}} size={16} />`)
  })

  it.each([
    ['w-3 h-3', 12],
    ['w-3.5 h-3.5', 14],
    ['h-4 w-4', 16],
    ['', 16],
    ['w-5 h-5', 20],
    ['size-6', 20],
  ])('snaps %s to %d', (classes, size) => {
    expect(body(svg(`className="${classes}"`))).toBe(`<Icon icon={icons.done} size={${size}} />`)
  })

  it('keeps the other classes and data attributes, and adds both imports', () => {
    const result = run(svg('className="h-5 w-5 flex-shrink-0 text-success" aria-hidden="true" data-testid="ok"'))
    expect(result.rewritten).toBe(1)
    expect(result.output).toBe(
      'import { cn } from "@/lib/utils"\nimport { Icon } from "@/components/ui/icon"\nimport { icons } from "@/lib/ui/icons"\n\n' +
        'export const A = () => <span><Icon icon={icons.done} size={20} className="text-success" data-testid="ok" /></span>\n'
    )
  })

  it('keeps aria-label or a title as the label', () => {
    expect(body(svg('className="h-4 w-4" aria-label="Done"'))).toBe('<Icon icon={icons.done} size={16} label="Done" />')
    expect(body(svg('className="h-4 w-4"', CHECK, '<title>Saved</title>'))).toBe(
      '<Icon icon={icons.done} size={16} label="Saved" />'
    )
  })

  it('leaves non-matching paths untouched and lists them by path with a suggestion', () => {
    const info = 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
    for (const d of [info, 'M5 13l4 4L19 8', `${CHECK}M1 1`]) {
      const jsx = svg('className="h-4 w-4"', d)
      expect(run(jsx).output).toBe(file(jsx))
      expect(run(jsx).reviews).toEqual([expect.objectContaining({ original: d, rule: 'unmapped-path', line: 3 })])
    }
    expect(run(svg('className="h-4 w-4"', info)).reviews[0].suggestion).toBe('icons.info')
  })

  it('holds a listed path it cannot carry over', () => {
    for (const attributes of ['className="h-8 w-8"', 'className="h-4 w-5"', 'className={cn("h-4 w-4")}', 'onClick={go}']) {
      const jsx = svg(attributes)
      expect(run(jsx).output).toBe(file(jsx))
      expect(run(jsx).reviews[0]).toMatchObject({ rule: 'held', original: CHECK })
    }
    const twoPaths = `<svg className="h-4 w-4"><path d="${CHECK}" /><path d="${CHECK}" /></svg>`
    expect(run(twoPaths).reviews[0]).toMatchObject({ rule: 'unmapped-path', original: `${CHECK} + ${CHECK}` })
  })

  it('reuses existing imports and is idempotent', () => {
    const source = `import { Icon } from "@/components/ui/icon"\nimport { icons } from "@/lib/ui/icons"\n${file(svg('className="h-4 w-4"'))}`
    const once = transformIcons('components/a.tsx', source).output
    expect(once.match(/^import /gm)).toHaveLength(3)
    expect(transformIcons('components/a.tsx', once)).toEqual({ output: once, reviews: [], rewritten: 0 })
  })
})

describe('main', () => {
  it('dry-runs by default, skips Rewind and chart art and writes with --write', () => {
    const root = mkdtempSync(join(tmpdir(), 'icons-'))
    for (const dir of ['components/admin', 'components/rewind', 'components/admin/charts']) {
      mkdirSync(join(root, dir), { recursive: true })
    }
    const source = file(svg('className="h-4 w-4"'))
    for (const path of ['components/admin/a.tsx', 'components/rewind/b.tsx', 'components/admin/charts/c.tsx']) {
      writeFileSync(join(root, path), source)
    }
    const lines: string[] = []

    expect(main([], root, (line) => lines.push(line))).toBe(0)
    expect(lines[0]).toBe('Would rewrite 1 SVGs in 1 of 1 files')
    expect(readFileSync(join(root, 'components/admin/a.tsx'), 'utf8')).toBe(source)

    expect(main(['--write', '--slice', 'components'], root, () => undefined)).toBe(0)
    expect(readFileSync(join(root, 'components/admin/a.tsx'), 'utf8')).toContain('<Icon icon={icons.done} size={16} />')
    expect(readFileSync(join(root, 'components/rewind/b.tsx'), 'utf8')).toBe(source)
    expect(readFileSync(join(root, 'codemod-icons-review.md'), 'utf8')).toContain('No review items.')
  })
})
