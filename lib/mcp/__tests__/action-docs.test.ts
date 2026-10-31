/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { extractActionDocs, renderActionDocs } from '@/lib/mcp/action-docs'
import { buildActionDocs } from '@/scripts/gen-mcp-docs'

describe('extractActionDocs', () => {
  it("reads each export's first paragraph without plan citations or tags", () => {
    const source = `
/**
 * Create an invite (P10.1, BP-30). Audited.
 *
 * More detail that is left out.
 */
export const createInvite = adminAction({})

/** Admin only. @public P8.8's playground shows it. */
export const estimate = adminAction({})

export const undocumented = adminAction({})

/**
 * Two lines
 * of summary.
 * @param x - ignored
 */
export const twoLines = adminAction({})
`
    expect(extractActionDocs(source)).toEqual({
      createInvite: 'Create an invite. Audited.',
      estimate: 'Admin only.',
      twoLines: 'Two lines of summary.',
    })
  })
})

describe('renderActionDocs', () => {
  it('sorts the entries', () => {
    expect(renderActionDocs({ b: 'B', a: 'A "quoted"' })).toContain('  a: "A \\"quoted\\"",\n  b: "B",')
  })
})

it('action-docs.generated.ts is current (npm run mcp:docs)', () => {
  const committed = readFileSync(join(__dirname, '..', 'action-docs.generated.ts'), 'utf8')
  expect(committed).toBe(buildActionDocs())
})
