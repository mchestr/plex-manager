/**
 * @jest-environment node
 */

import { z } from 'zod'

import { parseRouteParams, parseSearchParams } from '@/lib/actions/route'
import { ratingKeySchema, shareTokenSchema, yearParamSchema } from '@/lib/validations/params'

describe('parseRouteParams', () => {
  const schema = z.object({ ratingKey: ratingKeySchema })

  it('returns the parsed params', () => {
    expect(parseRouteParams(schema, { ratingKey: '123' })).toEqual({ ok: true, data: { ratingKey: '123' } })
  })

  it('answers ../1 with a 400 and a code', async () => {
    const parsed = parseRouteParams(schema, { ratingKey: '../1' }, { 'Cache-Control': 'private, no-store' })

    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.response.status).toBe(400)
    expect(parsed.response.headers.get('Cache-Control')).toBe('private, no-store')
    await expect(parsed.response.json()).resolves.toEqual({ error: 'Invalid rating key', code: 'VALIDATION_ERROR' })
  })
})

describe('parseSearchParams', () => {
  const schema = z.object({ token: shareTokenSchema, year: yearParamSchema.optional() })

  it('reads the query string, first value wins', () => {
    const token = 'a'.repeat(43)
    const parsed = parseSearchParams(schema, `http://localhost/x?token=${token}&year=2026&year=1999`)

    expect(parsed).toEqual({ ok: true, data: { token, year: 2026 } })
  })

  it.each([
    ['a malformed token', 'http://localhost/x?token=nope'],
    ['the year abc', `http://localhost/x?token=${'a'.repeat(43)}&year=abc`],
    ['a missing token', 'http://localhost/x'],
  ])('answers %s with a 400', async (_label, url) => {
    const parsed = parseSearchParams(schema, new URL(url))

    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.response.status).toBe(400)
    expect((await parsed.response.json()).code).toBe('VALIDATION_ERROR')
  })
})
