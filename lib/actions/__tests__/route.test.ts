/**
 * @jest-environment node
 */

import { z } from 'zod'

import { hasEntitlement } from '@/lib/actions/entitlement'
import { parseJsonBody, parseRouteParams, parseSearchParams, requireEntitlement, withRequestContext } from '@/lib/actions/route'
import { getLogContext } from '@/lib/utils/log-context'
import { ratingKeySchema, shareTokenSchema, yearParamSchema } from '@/lib/validations/params'

jest.mock('@/lib/actions/entitlement', () => ({
  ...jest.requireActual('@/lib/actions/entitlement'),
  hasEntitlement: jest.fn(),
}))

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

describe('parseJsonBody', () => {
  const schema = z.object({ ruleId: z.string().min(1, 'Name a rule'), page: z.number().int().optional() })
  const KB64 = 64 * 1024

  function post(body: BodyInit | null, headers?: HeadersInit): Request {
    return new Request('http://localhost/api/admin/cleanup/preview', { method: 'POST', body, headers })
  }

  /** A body that arrives in `chunks`, with no Content-Length, as a chunked upload does. */
  function streamed(chunks: Uint8Array[], onCancel = jest.fn()): Request {
    let next = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (next < chunks.length) controller.enqueue(chunks[next++])
        else controller.close()
      },
      cancel: onCancel,
    })
    const init: RequestInit & { duplex: 'half' } = { method: 'POST', body, duplex: 'half' }
    return new Request('http://localhost/api/admin/cleanup/preview', init)
  }

  async function refusal(parsed: Awaited<ReturnType<typeof parseJsonBody>>) {
    expect(parsed.ok).toBe(false)
    if (parsed.ok) throw new Error('expected a refusal')
    return { status: parsed.response.status, headers: parsed.response.headers, body: await parsed.response.json() }
  }

  it('returns the parsed body', async () => {
    await expect(parseJsonBody(schema, post(JSON.stringify({ ruleId: 'r1', page: 2 })))).resolves.toEqual({
      ok: true,
      data: { ruleId: 'r1', page: 2 },
    })
  })

  it('reads a body of exactly 64 KB', async () => {
    const json = JSON.stringify({ ruleId: 'r1' })
    const padded = json + ' '.repeat(KB64 - json.length)

    await expect(parseJsonBody(schema, post(padded))).resolves.toEqual({ ok: true, data: { ruleId: 'r1' } })
  })

  it('answers a body one byte over 64 KB with a 413', async () => {
    const json = JSON.stringify({ ruleId: 'r1' })
    const padded = json + ' '.repeat(KB64 + 1 - json.length)

    const { status, headers, body } = await refusal(await parseJsonBody(schema, post(padded), { 'Cache-Control': 'no-store' }))

    expect(status).toBe(413)
    expect(headers.get('Cache-Control')).toBe('no-store')
    expect(body).toEqual({ error: 'Request body is too large', code: 'VALIDATION_ERROR' })
  })

  it('counts bytes, not characters', async () => {
    // 40,000 two-byte characters: 80,000 bytes in fewer than 64 K characters
    const { status } = await refusal(await parseJsonBody(schema, post(JSON.stringify({ ruleId: '\u00e9'.repeat(40_000) }))))

    expect(status).toBe(413)
  })

  it('refuses a declared Content-Length over 64 KB before it reads the body', async () => {
    const request = post(JSON.stringify({ ruleId: 'r1' }), { 'content-length': String(KB64 + 1) })

    const { status } = await refusal(await parseJsonBody(schema, request))

    expect(status).toBe(413)
    expect(request.bodyUsed).toBe(false)
  })

  it('stops reading a chunked body once it passes 64 KB', async () => {
    const onCancel = jest.fn()
    const chunk = new Uint8Array(16 * 1024).fill(0x20)
    const chunks = Array.from({ length: 10 }, () => chunk)

    const { status } = await refusal(await parseJsonBody(schema, streamed(chunks, onCancel)))

    expect(status).toBe(413)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('decodes a character split across two chunks', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ ruleId: 'caf\u00e9' }))
    const split = bytes.indexOf(0xc3) + 1

    await expect(parseJsonBody(schema, streamed([bytes.slice(0, split), bytes.slice(split)]))).resolves.toEqual({
      ok: true,
      data: { ruleId: 'caf\u00e9' },
    })
  })

  it.each([
    ['an empty body', null],
    ['a body that is not JSON', '{"ruleId": '],
    ['a form body', 'ruleId=r1'],
  ])('answers %s with a 400', async (_label, raw) => {
    const { status, body } = await refusal(await parseJsonBody(schema, post(raw)))

    expect(status).toBe(400)
    expect(body).toEqual({ error: 'Request body is not valid JSON', code: 'VALIDATION_ERROR' })
  })

  it("answers a schema failure with a 400 and the schema's message", async () => {
    const { status, body } = await refusal(await parseJsonBody(schema, post(JSON.stringify({ ruleId: '' }))))

    expect(status).toBe(400)
    expect(body).toEqual({ error: 'Name a rule', code: 'VALIDATION_ERROR' })
  })
})

describe('requireEntitlement', () => {
  const session = { expires: '2099-01-01', user: { id: 'member-1', isAdmin: false } }

  it('passes a member who meets the level', async () => {
    jest.mocked(hasEntitlement).mockResolvedValue(true)

    await expect(requireEntitlement(session, 'read')).resolves.toEqual({ ok: true })
    expect(hasEntitlement).toHaveBeenCalledWith('member-1', 'read')
  })

  it('answers a member below the level with a 403 and a code', async () => {
    jest.mocked(hasEntitlement).mockResolvedValue(false)

    const checked = await requireEntitlement(session, 'full', { headers: { 'Cache-Control': 'private, no-store' } })

    expect(checked.ok).toBe(false)
    if (checked.ok) return
    expect(checked.response.status).toBe(403)
    expect(checked.response.headers.get('Cache-Control')).toBe('private, no-store')
    await expect(checked.response.json()).resolves.toEqual({
      error: 'This needs an active membership.',
      code: 'NOT_ENTITLED',
    })
  })

  it('redirects a page request to /subscribe on the same origin', async () => {
    jest.mocked(hasEntitlement).mockResolvedValue(false)

    const checked = await requireEntitlement(session, 'full', { redirectFrom: 'https://plex.example.com/discord/connect' })

    expect(checked.ok).toBe(false)
    if (checked.ok) return
    expect(checked.response.status).toBe(307)
    expect(checked.response.headers.get('location')).toBe('https://plex.example.com/subscribe')
  })
})

describe('withRequestContext (P11.4)', () => {
  const handler = withRequestContext(async (_request: Request, label: string) => ({ label, ctx: getLogContext() }))

  it("runs the handler with the request's x-request-id and passes its arguments through", async () => {
    const request = new Request('http://localhost/api/x', { headers: { 'x-request-id': 'demo-1234abcd' } })

    await expect(handler(request, 'ctx')).resolves.toEqual({ label: 'ctx', ctx: { requestId: 'demo-1234abcd' } })
  })

  it('generates an id when the header is missing or invalid', async () => {
    const request = new Request('http://localhost/api/x', { headers: { 'x-request-id': '<script>' } })

    const { ctx } = await handler(request, 'ctx')

    expect(ctx?.requestId).toMatch(/^[0-9a-f-]{32,36}$/)
  })
})
