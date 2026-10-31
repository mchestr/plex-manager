/**
 * @jest-environment node
 */
import { limitResult, MAX_RESULT_CHARS } from '@/lib/mcp/result-limit'

describe('limitResult', () => {
  it('passes a result at or under the limit through', () => {
    const result = { text: 'x'.repeat(MAX_RESULT_CHARS), isError: false }
    expect(limitResult(result)).toEqual({ ...result, tooLarge: false })
  })

  it('refuses a larger one with its size and how to ask for less', () => {
    const limited = limitResult({ text: 'x'.repeat(70_000), isError: false })
    expect(limited.tooLarge).toBe(true)
    expect(limited.isError).toBe(true)
    const body = JSON.parse(limited.text)
    expect(body).toMatchObject({ success: false, code: 'RESULT_TOO_LARGE' })
    expect(body.error).toContain('70000 characters (about 20k tokens)')
    expect(body.error).toContain(`${MAX_RESULT_CHARS}-character limit`)
    expect(body.error).toMatch(/smaller page, pageSize or limit/)
  })

  it('takes a tool’s own limit', () => {
    expect(limitResult({ text: 'x'.repeat(100_000), isError: false }, 120_000).tooLarge).toBe(false)
    expect(limitResult({ text: 'x'.repeat(100), isError: false }, 50).tooLarge).toBe(true)
  })

  it('refuses an oversized error too', () => {
    expect(limitResult({ text: 'e'.repeat(MAX_RESULT_CHARS + 1), isError: true }).tooLarge).toBe(true)
  })
})
