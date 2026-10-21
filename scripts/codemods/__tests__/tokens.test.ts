/**
 * @jest-environment node
 */

/**
 * The token codemod (P10.13): the 9.3 auto pairs with prefixes, `!` and
 * opacity, review routing and the context rule, the class sources, the skip
 * list, idempotence and the review file.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  formatReview,
  isSkipped,
  main,
  parseClass,
  resolveSlices,
  rewriteClassString,
  transformSource,
} from '../tokens'

const tsx = (className: string) => `export const A = () => <div className="${className}" />\n`
const rewrite = (className: string) => transformSource('components/a.tsx', tsx(className)).output
const expectAuto = (from: string, to: string) => expect(rewrite(from)).toBe(tsx(to))

describe('parseClass', () => {
  it('splits variants, the ! modifier and the utility, brackets included', () => {
    expect(parseClass('md:hover:!bg-slate-800/50')).toEqual({
      prefix: 'md:hover:',
      utility: 'bg-slate-800/50',
      bangStart: true,
      bangEnd: false,
    })
    expect(parseClass('[&>svg]:text-slate-400!')).toMatchObject({ prefix: '[&>svg]:', utility: 'text-slate-400', bangEnd: true })
  })
})

describe('auto pairs', () => {
  it.each([
    ['text-white', 'text-foreground'],
    ['text-slate-50', 'text-foreground'],
    ['text-slate-100', 'text-foreground'],
    ['text-slate-200', 'text-foreground'],
    ['text-slate-400', 'text-muted-foreground'],
    ['text-slate-500', 'text-muted-foreground'],
    ['text-slate-600', 'text-muted-foreground'],
    ['border-slate-700', 'border-border'],
    ['border-slate-800', 'border-border'],
    ['border-t-slate-700', 'border-t-border'],
    ['divide-slate-700', 'divide-border'],
    ['border-slate-600', 'border-input'],
    ['hover:bg-slate-700/50', 'hover:bg-accent'],
    ['hover:bg-slate-800', 'hover:bg-accent'],
    ['bg-white/5', 'bg-accent'],
    ['hover:bg-white/10', 'hover:bg-accent'],
    ['placeholder-slate-500', 'placeholder:text-muted-foreground'],
    ['text-green-400', 'text-success'],
    ['text-red-400', 'text-destructive'],
    ['text-yellow-400', 'text-warning'],
    ['text-blue-400', 'text-info'],
    ['text-purple-400', 'text-foreground'],
    ['text-[10px]', 'text-caption'],
    ['text-[9px]', 'text-caption'],
    ['text-[11px]', 'text-caption'],
  ])('%s becomes %s', (from, to) => expectAuto(`p-4 ${from}`, `p-4 ${to}`))

  it('keeps variant prefixes, the ! modifier and opacity suffixes', () => {
    expectAuto('hover:text-white sm:text-slate-400', 'hover:text-foreground sm:text-muted-foreground')
    expectAuto('group-hover:text-white disabled:text-slate-500', 'group-hover:text-foreground disabled:text-muted-foreground')
    expectAuto('!text-white text-slate-400!', '!text-foreground text-muted-foreground!')
    expectAuto('border-slate-700/50 text-white/80', 'border-border/50 text-foreground/80')
    expectAuto('focus:placeholder-slate-500', 'focus:placeholder:text-muted-foreground')
  })

  it('removes focus:outline-none, focus:ring-* and focus:ring-offset-*', () => {
    expectAuto(
      'rounded focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 px-3',
      'rounded px-3'
    )
    expectAuto('focus:outline-none', '')
  })

  it('turns gradient text into text-foreground', () => {
    expectAuto(
      'text-4xl bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent',
      'text-4xl text-foreground'
    )
  })
})

describe('review routing', () => {
  it.each([
    ['bg-slate-900', 'page-wrapper'],
    ['bg-slate-950', 'page-wrapper'],
    ['bg-slate-800/50', 'panel'],
    ['bg-slate-800', 'surface-card'],
    ['bg-slate-700', 'surface-secondary'],
    ['text-slate-300', 'text-secondary'],
    ['text-cyan-400', 'link-label'],
    ['bg-gradient-to-r', 'gradient'],
    ['bg-cyan-600', 'cta-fill'],
    ['bg-[#e5a00d]', 'arbitrary-color'],
    ['z-[9999]', 'z-index'],
    ['backdrop-blur-sm', 'blur'],
    ['bg-blue-600', 'raw-palette'],
  ])('%s goes to review as %s', (cls, rule) => {
    const result = transformSource('components/a.tsx', tsx(cls))
    expect(result.output).toBe(tsx(cls))
    expect(result.reviews).toEqual([expect.objectContaining({ rule, line: 1, original: cls })])
  })

  it('sends uppercase tracked eyebrows to review', () => {
    expect(transformSource('a.tsx', tsx('uppercase tracking-wide')).reviews[0].rule).toBe('eyebrow')
  })

  it('applies the context rule: bg-cyan-600 text-white is left untouched', () => {
    const result = transformSource('components/a.tsx', tsx('bg-cyan-600 text-white'))
    expect(result.output).toBe(tsx('bg-cyan-600 text-white'))
    expect(result.reviews).toHaveLength(1)
    expect(result.reviews[0].suggestion).toContain('text-white: text-foreground (auto, held)')
    expect(rewriteClassString('bg-cyan-600 text-white')).toEqual({ text: 'bg-cyan-600 text-white', review: true })
  })

  it('holds text-white in a Button or on a coloured fill up the tree, but not on a neutral panel', () => {
    const source = [
      `const A = () => (`,
      `  <div className="bg-slate-800/50">`,
      `    <Button><Spinner className="text-white" /></Button>`,
      `    <div className="bg-gradient-to-br from-amber-500 to-orange-600"><svg className="h-5 text-white" /></div>`,
      `    <div style={{ background: brand }}><svg className="text-white" /></div>`,
      `    <p className="text-white" />`,
      `  </div>`,
      `)`,
      '',
    ].join('\n')
    const result = transformSource('a.tsx', source)
    expect(result.output).toBe(source.replace('<p className="text-white" />', '<p className="text-foreground" />'))
    expect(result.reviews.filter((item) => item.rule === 'on-fill').map((item) => item.line)).toEqual([3, 4, 5])
  })

  it('holds the whole className unit, across cn() arguments', () => {
    const source = `const A = () => <a className={cn('text-white', active && 'bg-cyan-600')} />\n`
    const result = transformSource('a.tsx', source)
    expect(result.output).toBe(source)
    expect(result.reviews.map((item) => item.original)).toEqual(['text-white', 'bg-cyan-600'])
  })
})

describe('sources', () => {
  it('rewrites cn(), clsx(), twMerge() arguments, conditionals and clsx object keys', () => {
    const source = [
      `const a = cn('text-white', open ? 'text-slate-400' : 'border-slate-700', x || 'text-red-400')`,
      `const b = clsx({ 'text-white': on }, ['text-slate-500'])`,
      `const c = twMerge('text-white', props.className)`,
      '',
    ].join('\n')
    expect(transformSource('a.ts', source).output).toBe(
      [
        `const a = cn('text-foreground', open ? 'text-muted-foreground' : 'border-border', x || 'text-destructive')`,
        `const b = clsx({ 'text-foreground': on }, ['text-muted-foreground'])`,
        `const c = twMerge('text-foreground', props.className)`,
        '',
      ].join('\n')
    )
  })

  it('rewrites template literals and never reads a class touching ${}', () => {
    const source = 'const A = () => <p className={`text-white ${big ? "text-slate-400" : ""} bg-${tone}-500 text-slate-500`} />\n'
    expect(transformSource('a.tsx', source).output).toBe(
      'const A = () => <p className={`text-foreground ${big ? "text-muted-foreground" : ""} bg-${tone}-500 text-muted-foreground`} />\n'
    )
  })

  it('keeps whitespace next to ${} when it removes a class', () => {
    const source = 'const A = () => <p className={`${a} focus:outline-none b`} />\n'
    expect(transformSource('a.tsx', source).output).toBe('const A = () => <p className={`${a} b`} />\n')
  })

  it('rewrites the cva base and sends its variant map to review only', () => {
    const source = `const v = cva('text-white', { variants: { tone: { muted: 'text-slate-400' } } })\n`
    const result = transformSource('a.ts', source)
    expect(result.output).toBe(`const v = cva('text-foreground', { variants: { tone: { muted: 'text-slate-400' } } })\n`)
    expect(result.reviews).toEqual([expect.objectContaining({ rule: 'class-map, text-muted', original: 'text-slate-400' })])
  })

  it('sends *Classes, *ClassName and *classes object literals to review only', () => {
    const source = [
      `const toneClasses = { ok: 'text-green-400' } as const`,
      `const panelClassName = { base: 'text-white' }`,
      `const classes = { a: 'border-slate-700' }`,
      '',
    ].join('\n')
    const result = transformSource('a.ts', source)
    expect(result.output).toBe(source)
    expect(result.reviews.map((item) => item.line)).toEqual([1, 2, 3])
  })

  it('leaves strings outside class contexts alone', () => {
    const source = [
      `const A = () => <input placeholder="text-white" aria-label="text-slate-400" />`,
      `const label = 'text-white'`,
      `const t = fn('text-white')`,
      '',
    ].join('\n')
    const result = transformSource('a.tsx', source)
    expect(result.output).toBe(source)
    expect(result.reviews).toEqual([])
  })
})

describe('idempotence', () => {
  it('changes nothing on a second run', () => {
    const source = [
      `const A = () => <div className="text-white border-slate-700/50 focus:outline-none focus:ring-2">`,
      `  <p className={cn('text-slate-400', 'bg-slate-800/50')} />`,
      `  <h1 className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent" />`,
      `</div>`,
      '',
    ].join('\n')
    const first = transformSource('a.tsx', source)
    const second = transformSource('a.tsx', first.output)
    expect(second.output).toBe(first.output)
    expect(second.reviews).toEqual(first.reviews)
    expect(Object.values(second.counts).every((count) => count.auto === 0)).toBe(true)
  })
})

describe('skip list and review file', () => {
  it.each([
    ['components/ui/button.tsx', true],
    ['components/wrapped/viewer.tsx', true],
    ['app/(app)/wrapped/page.tsx', true],
    ['components/generator/x.tsx', true],
    ['components/shared/formatted-text.tsx', true],
    ['app/api/wrapped/og-image/route.tsx', true],
    ['components/dashboard/__tests__/card.test.tsx', true],
    ['components/dashboard/card.tsx', false],
    ['app/(app)/page.tsx', false],
  ])('%s skipped: %s', (path, skipped) => expect(isSkipped(path)).toBe(skipped))

  it('formats a table with file, line, original, suggestion and rule', () => {
    const review = formatReview([
      { file: 'a.tsx', line: 3, original: 'bg-cyan-600', suggestion: 'bg-cyan-600: <Button>', rule: 'cta-fill' },
    ])
    expect(review).toContain('| File | Line | Original | Suggestion | Rule |')
    expect(review).toContain('| a.tsx | 3 | `bg-cyan-600` | bg-cyan-600: <Button> | cta-fill |')
    expect(formatReview([])).toContain('No review items.')
  })
})

describe('CLI', () => {
  const root = mkdtempSync(join(tmpdir(), 'tokens-codemod-'))
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  put('app/(app)/page.tsx', tsx('text-white bg-slate-800/50'))
  put('components/dashboard/card.tsx', tsx('text-white'))
  put('components/dashboard/__tests__/card.test.tsx', tsx('text-white'))
  put('components/ui/card.tsx', tsx('text-white'))

  it('resolves folders, files and globs, minus the skip list', () => {
    expect(resolveSlices(['components'], root)).toEqual(['components/dashboard/card.tsx'])
    expect(resolveSlices(['app/(app)', 'components/**/*.tsx'], root)).toEqual([
      'app/(app)/page.tsx',
      'components/dashboard/card.tsx',
    ])
  })

  it('dry-runs by default, writes with --write, and is a no-op the second time', () => {
    const lines: string[] = []
    const log = (line: string) => lines.push(line)
    expect(main(['--slice', 'components/dashboard', 'app/(app)'], root, log)).toBe(0)
    expect(readFileSync(join(root, 'components/dashboard/card.tsx'), 'utf8')).toBe(tsx('text-white'))
    expect(lines[0]).toBe('Would rewrite 1 of 2 files')
    expect(lines.some((line) => /text-foreground\s+auto\s+1\s+review\s+1/.test(line))).toBe(true)

    expect(main(['--slice', 'components/dashboard', 'app/(app)', '--write'], root, log)).toBe(0)
    expect(readFileSync(join(root, 'components/dashboard/card.tsx'), 'utf8')).toBe(tsx('text-foreground'))
    const review = readFileSync(join(root, 'codemod-review.md'), 'utf8')
    expect(review).toContain('| app/(app)/page.tsx | 1 | `text-white bg-slate-800/50` |')

    lines.length = 0
    expect(main(['--slice', 'components/dashboard', 'app/(app)', '--write'], root, log)).toBe(0)
    expect(lines[0]).toBe('Rewrote 0 of 2 files')
    expect(readFileSync(join(root, 'codemod-review.md'), 'utf8')).toBe(review)
  })

  it('fails without a slice', () => {
    expect(main([], root, () => {})).toBe(2)
  })
})
