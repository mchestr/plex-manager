/**
 * @jest-environment node
 */

/**
 * The adapter codemod (P10.11): a before and after fixture for each automatic
 * mapping, the review list for each structural one, and idempotence.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { main, transformAdapters } from '../adapters'

const file = (imports: string, jsx: string) => `${imports}\n\nexport const A = () => (\n  ${jsx}\n)\n`
const run = (imports: string, jsx: string) => transformAdapters('components/a.tsx', file(imports, jsx))

describe('transformAdapters: automatic mappings', () => {
  it('maps the deprecated Button variants and size', () => {
    const imports = 'import { Button } from "@/components/ui/button"'
    const result = run(imports, '<div><Button variant="danger" size="md">A</Button><Button variant={"success"}>B</Button></div>')
    expect(result.output).toBe(
      file(imports, '<div><Button variant="destructive" size="default">A</Button><Button variant="secondary">B</Button></div>')
    )
    expect(result.rewritten).toBe(2)
  })

  it('moves Badge tone to variant, and lets an explicit variant win', () => {
    const imports = 'import { Badge } from "@/components/ui/badge"'
    expect(run(imports, '<Badge tone="danger">A</Badge>').output).toBe(file(imports, '<Badge variant="destructive">A</Badge>'))
    expect(run(imports, '<Badge tone="warning" data-testid="x">A</Badge>').output).toBe(
      file(imports, '<Badge variant="warning" data-testid="x">A</Badge>')
    )
    expect(run(imports, '<Badge variant="outline" tone="danger">A</Badge>').output).toBe(file(imports, '<Badge variant="outline">A</Badge>'))
  })

  it('maps Alert tone="danger" only', () => {
    const imports = 'import { Alert } from "@/components/ui/alert"'
    expect(run(imports, '<Alert tone="danger">A</Alert>').output).toBe(file(imports, '<Alert tone="destructive">A</Alert>'))
    expect(run(imports, '<Alert tone="info">A</Alert>').rewritten).toBe(0)
  })

  it('moves Card padding and className onto a CardContent', () => {
    const imports = 'import { Card } from "@/components/ui/card"'
    const result = run(imports, '<Card padding="md" className="gap-2" data-testid="c"><p>Hi</p></Card>')
    expect(result.output).toBe(
      file(
        'import { Card, CardContent } from "@/components/ui/card"',
        '<Card data-testid="c"><CardContent className="p-6 gap-2"><p>Hi</p></CardContent></Card>'
      )
    )
  })

  it('maps LoadingSpinner sizes to Spinner and drops the old import', () => {
    const imports = 'import { LoadingSpinner } from "@/components/ui/loading-spinner"'
    const result = run(imports, '<div><LoadingSpinner size="xl" label="Loading users" /><LoadingSpinner /></div>')
    expect(result.output).toBe(
      file('import { Spinner } from "@/components/ui/spinner"', '<div><Spinner size={24} label="Loading users" /><Spinner size={16} /></div>')
    )
  })

  it('moves StyledInput and StyledTextarea onto Input and Textarea, keeping the setup test id', () => {
    const imports = 'import { StyledInput } from "@/components/ui/styled-input"\nimport { StyledTextarea } from "@/components/ui/styled-textarea"'
    const result = run(
      imports,
      '<div><StyledInput name="url" size="sm" className="w-full" error={!!errors.url} /><StyledTextarea name="note" resize="none" data-testid="n" /></div>'
    )
    expect(result.output).toBe(
      file(
        'import { Input } from "@/components/ui/input"\nimport { Textarea } from "@/components/ui/textarea"',
        '<div><Input data-testid="setup-input-url" name="url" className="h-8 w-full" aria-invalid={!!errors.url || undefined} /><Textarea className="resize-none" name="note" data-testid="n" /></div>'
      )
    )
  })

  it('moves StyledCheckbox onChange to onCheckedChange', () => {
    const imports = 'import { StyledCheckbox } from "@/components/ui/styled-checkbox"'
    const result = run(imports, '<StyledCheckbox checked={on} onChange={(e) => setOn(e.target.checked)} />')
    expect(result.output).toBe(
      file('import { Checkbox } from "@/components/ui/checkbox"', '<Checkbox checked={on} onCheckedChange={(checked) => setOn(checked)} />')
    )
  })

  it('moves ModalShell isOpen and onClose to Dialog open and onOpenChange, and lists its body for review', () => {
    const imports = 'import { ModalShell } from "@/components/ui/modal-shell"'
    const result = run(imports, '<ModalShell isOpen={open} onClose={close}><p>Hi</p></ModalShell>')
    expect(result.output).toBe(
      file(
        'import { Dialog } from "@/components/ui/dialog"',
        '<Dialog open={open} onOpenChange={(open) => { if (!open) close() }}><p>Hi</p></Dialog>'
      )
    )
    expect(result.reviews).toEqual([expect.objectContaining({ rule: 'structural', original: '<ModalShell>' })])
  })

  it('leaves a tone on a component that is not Badge or Alert alone', () => {
    const imports = 'import { ConfirmDialog } from "@/components/ui/confirm-dialog"'
    expect(run(imports, '<ConfirmDialog tone="danger" />').rewritten).toBe(0)
  })

  it('is a no-op the second time', () => {
    const imports = 'import { Button } from "@/components/ui/button"\nimport { Card } from "@/components/ui/card"'
    const once = run(imports, '<Card padding="sm"><Button variant="danger">A</Button></Card>').output
    expect(transformAdapters('components/a.tsx', once)).toEqual({ output: once, reviews: [], rewritten: 0 })
  })
})

describe('transformAdapters: review', () => {
  it.each([
    ['StyledDropdown', '@/components/ui/styled-dropdown', 'Select'],
    ['ConfirmModal', '@/components/admin/shared/confirm-modal', 'ConfirmDialog'],
    ['LoadingScreen', '@/components/ui/loading-screen', 'skeleton'],
  ])('lists %s for a hand edit and leaves it unchanged', (name, from, suggestion) => {
    const imports = `import { ${name} } from "${from}"`
    const result = run(imports, `<${name} value="a" />`)
    expect(result.output).toBe(file(imports, `<${name} value="a" />`))
    expect(result.reviews).toEqual([
      expect.objectContaining({ file: 'components/a.tsx', line: 4, rule: 'structural', suggestion: expect.stringContaining(suggestion) }),
    ])
  })

  it('lists props it cannot read', () => {
    const imports = 'import { Badge } from "@/components/ui/badge"\nimport { Card } from "@/components/ui/card"'
    const result = run(imports, '<div><Badge tone={tone}>A</Badge><Card padding={pad}>B</Card></div>')
    expect(result.rewritten).toBe(0)
    expect(result.reviews.map((item) => item.rule)).toEqual(['expression', 'expression'])
  })
})

describe('main', () => {
  it('rewrites with --write and writes the review list', () => {
    const root = mkdtempSync(join(tmpdir(), 'adapters-'))
    mkdirSync(join(root, 'components'))
    const path = join(root, 'components', 'a.tsx')
    writeFileSync(path, file('import { Button } from "@/components/ui/button"', '<Button variant="danger">A</Button>'))
    const log: string[] = []
    expect(main(['--slice', 'components', '--write'], root, (line) => log.push(line))).toBe(0)
    expect(readFileSync(path, 'utf8')).toContain('variant="destructive"')
    expect(log[0]).toBe('Rewrote 1 elements in 1 of 1 files')
    expect(readFileSync(join(root, 'codemod-review.md'), 'utf8')).toContain('No review items.')
  })
})
