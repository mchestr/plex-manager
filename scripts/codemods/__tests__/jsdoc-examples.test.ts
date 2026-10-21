/**
 * @jest-environment node
 */

import { rewriteClassString } from '../tokens'

describe('JSDoc Documentation Examples', () => {
  it('rewriteClassString matches its documented behaviour', () => {
    expect(rewriteClassString('hover:border-slate-700/50 text-white').text).toBe('hover:border-border/50 text-foreground')
    expect(rewriteClassString('bg-cyan-600 text-white').text).toBe('bg-cyan-600 text-white')
  })
})
