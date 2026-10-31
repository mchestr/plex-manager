/**
 * @jest-environment node
 */
import { limitResult, MAX_RESULT_CHARS } from '@/lib/mcp/result-limit'

const text = (length: number) => 'x'.repeat(length)

describe('limitResult for a tool that reads', () => {
  it('passes a result at or under the limit through', () => {
    const result = { text: text(MAX_RESULT_CHARS), isError: false }
    expect(limitResult(result, { readOnly: true })).toEqual({ ...result, tooLarge: false })
  })

  it('refuses a larger one with its size and how to ask for less', () => {
    const limited = limitResult({ text: text(70_000), isError: false }, { readOnly: true })
    expect(limited.tooLarge).toBe(true)
    expect(limited.isError).toBe(true)
    const body = JSON.parse(limited.text)
    expect(body).toMatchObject({ success: false, code: 'RESULT_TOO_LARGE' })
    expect(body.error).toContain('70000 characters (about 20k tokens)')
    expect(body.error).toContain(`${MAX_RESULT_CHARS}-character limit`)
    expect(body.error).toMatch(/smaller page, pageSize or limit/)
  })

  it('takes a tool’s own limit', () => {
    expect(limitResult({ text: text(100_000), isError: false }, { readOnly: true, limit: 120_000 }).tooLarge).toBe(false)
    expect(limitResult({ text: text(100), isError: false }, { readOnly: true, limit: 50 }).tooLarge).toBe(true)
  })
})

describe('limitResult for a tool that changes something', () => {
  it('keeps a success, leaves the result out and says how to see the new state', () => {
    const limited = limitResult({ text: text(MAX_RESULT_CHARS + 1), isError: false }, { readOnly: false })
    expect(limited).toMatchObject({ isError: false, tooLarge: true })
    const body = JSON.parse(limited.text)
    expect(body).toMatchObject({ success: true, resultOmitted: true })
    expect(body.note).toMatch(/^The tool ran, but its result was 40001 characters/)
    expect(body.note).toContain('Read the new state with a list_* or get_* tool.')
    expect(body).not.toHaveProperty('code')
  })

  it('keeps a failure a failure', () => {
    const limited = limitResult({ text: text(MAX_RESULT_CHARS + 1), isError: true }, { readOnly: false })
    expect(limited.isError).toBe(true)
    expect(JSON.parse(limited.text)).toMatchObject({ success: false, resultOmitted: true, note: expect.stringMatching(/^The tool ran and failed/) })
  })

  it('passes a result under the limit through unchanged', () => {
    const result = { text: '{"success":true,"data":{"id":"inv-1"}}', isError: false }
    expect(limitResult(result, { readOnly: false })).toEqual({ ...result, tooLarge: false })
  })
})
