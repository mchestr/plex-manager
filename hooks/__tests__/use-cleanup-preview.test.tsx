/**
 * The live preview query (TS 10.7, UX 7.11): the key, the server render's
 * preview for the first key, the abort of the request before on a key
 * change, the last result kept while the next one loads, and the 429.
 */

import { act, renderHook, waitFor } from '@testing-library/react'

import { createQueryWrapper } from '@/__tests__/helpers/query-client'
import {
  CLEANUP_PREVIEW_URL,
  fetchCleanupPreview,
  PreviewFailed,
  previewKey,
  PreviewRateLimited,
  previewView,
  useCleanupPreview,
} from '@/hooks/use-cleanup-preview'
import type { PreviewResponse } from '@/lib/cleanup/types/preview'
import type { PreviewRequest } from '@/lib/validations/cleanup-actions'

const DEFINITION = {
  schemaVersion: 1 as const, level: 'movie' as const, libraries: ['1'], protections: [],
  conditions: [{ id: 'c1', field: 'file.size' as const, op: 'moreThan', value: { bytes: 20 * 1024 ** 3, unit: 'GB' } }],
  then: { graceDays: 30 },
}
const REQUEST: PreviewRequest = { definition: DEFINITION, tab: 'matches' }
const preview = (matches: number) => ({ matches, rows: [] }) as unknown as PreviewResponse

interface Reply { status: number; body?: unknown; retryAfter?: string }
const fetchMock = jest.fn<Promise<unknown>, [string, RequestInit]>()

function reply({ status, body, retryAfter }: Reply) {
  return { status, ok: status >= 200 && status < 300, headers: { get: (name: string) => (name === 'Retry-After' ? (retryAfter ?? null) : null) }, json: async () => body }
}

/** A reply that waits until the request is aborted, and then rejects as fetch does. */
function pending(init: RequestInit): Promise<unknown> {
  return new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
}

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('the key', () => {
  it('joins the view parts, with the defaults for missing ones', () => {
    expect(previewView(REQUEST)).toBe('matches|largest|1|||')
    expect(previewView({ ...REQUEST, tab: 'nearMisses', sort: 'closest', page: 2, search: 'big', nearMissCondition: 'c1', focus: { conditionId: 'c1' } }))
      .toBe('nearMisses|closest|2|big|c1|c1')
    expect(previewKey('new', REQUEST)).toEqual(['cleanup-preview', 'new', expect.stringContaining('"field":"file.size"'), 'matches|largest|1|||'])
  })

  it('gives the same key to the same draft in another key order', () => {
    const reordered = { ...REQUEST, definition: { then: DEFINITION.then, conditions: DEFINITION.conditions, protections: [], libraries: ['1'], level: 'movie' as const, schemaVersion: 1 as const } }
    expect(previewKey('rule-1', reordered)).toEqual(previewKey('rule-1', REQUEST))
  })
})

describe('fetchCleanupPreview', () => {
  it('posts the request as JSON with the signal', async () => {
    fetchMock.mockResolvedValue(reply({ status: 200, body: preview(3) }))
    const controller = new AbortController()
    await expect(fetchCleanupPreview(REQUEST, controller.signal)).resolves.toEqual(preview(3))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(CLEANUP_PREVIEW_URL)
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify(REQUEST), signal: controller.signal })
  })

  it('throws PreviewRateLimited on a 429, with the wait when the route gives one', async () => {
    fetchMock.mockResolvedValueOnce(reply({ status: 429, retryAfter: '42' }))
    await expect(fetchCleanupPreview(REQUEST)).rejects.toMatchObject({ name: 'PreviewRateLimited', retryAfterSec: 42,
      message: 'Too many updates. The preview pauses for a minute.' })
    fetchMock.mockResolvedValueOnce(reply({ status: 429 }))
    await expect(fetchCleanupPreview(REQUEST)).rejects.toMatchObject({ retryAfterSec: null })
  })

  it('throws PreviewFailed with the status for any other failure, with no server text', async () => {
    fetchMock.mockResolvedValueOnce(reply({ status: 500, body: { error: 'db.internal refused' } }))
    const error = await fetchCleanupPreview(REQUEST).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PreviewFailed)
    expect(error).toMatchObject({ status: 500, message: 'The preview did not load.' })
  })
})

describe('useCleanupPreview', () => {
  it('shows the server render for the first key without a fetch at mount', async () => {
    const initial = { request: REQUEST, data: preview(7), updatedAt: Date.now() }
    const { result } = renderHook(() => useCleanupPreview({ scope: 'rule-1', request: REQUEST, initial }), { wrapper: createQueryWrapper() })
    expect(result.current.data).toEqual(preview(7))
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches a key that the server render does not answer', async () => {
    fetchMock.mockResolvedValue(reply({ status: 200, body: preview(2) }))
    const initial = { request: REQUEST, data: preview(7), updatedAt: Date.now() }
    const { result } = renderHook(() => useCleanupPreview({ scope: 'rule-1', request: { ...REQUEST, page: 2 }, initial }), { wrapper: createQueryWrapper() })
    await waitFor(() => expect(result.current.data).toEqual(preview(2)))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('aborts the request before on a key change, and keeps the last result while the next one loads', async () => {
    fetchMock.mockResolvedValueOnce(reply({ status: 200, body: preview(1) }))
    const { result, rerender } = renderHook(({ request }) => useCleanupPreview({ scope: 'new', request }), {
      wrapper: createQueryWrapper(), initialProps: { request: REQUEST },
    })
    await waitFor(() => expect(result.current.data).toEqual(preview(1)))

    fetchMock.mockImplementationOnce((_url, init) => pending(init))
    rerender({ request: { ...REQUEST, page: 2 } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(result.current.data).toEqual(preview(1))
    expect(result.current.isPlaceholderData).toBe(true)

    fetchMock.mockResolvedValueOnce(reply({ status: 200, body: preview(3) }))
    rerender({ request: { ...REQUEST, page: 3 } })
    await waitFor(() => expect(result.current.data).toEqual(preview(3)))
    expect(fetchMock.mock.calls[1][1].signal?.aborted).toBe(true)
    expect(fetchMock.mock.calls[2][1].signal?.aborted).toBe(false)
  })

  it('surfaces a 429 as PreviewRateLimited, with no retry', async () => {
    fetchMock.mockResolvedValue(reply({ status: 429, retryAfter: '60' }))
    const { result } = renderHook(() => useCleanupPreview({ scope: 'new', request: REQUEST }), { wrapper: createQueryWrapper() })
    await waitFor(() => expect(result.current.error).toBeInstanceOf(PreviewRateLimited))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stays idle while disabled', async () => {
    renderHook(() => useCleanupPreview({ scope: 'new', request: REQUEST, enabled: false }), { wrapper: createQueryWrapper() })
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
