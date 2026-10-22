/**
 * The command menu's search hook (P10.16, UI-41): a 180ms debounce, the last
 * results kept while the next request runs, and the response checked with
 * Zod before the menu sees it.
 */

import { act, renderHook } from '@testing-library/react'

import { createQueryWrapper } from '@/__tests__/helpers/query-client'
import { useAdminSearch } from '@/hooks/admin/use-admin-search'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as Response
}

function result(id: string, label: string) {
  return { id, label, sub: 'Member', href: `/admin/users/${id}` }
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms)
  })
}

const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()

beforeEach(() => {
  jest.useFakeTimers()
  fetchMock.mockReset()
  global.fetch = fetchMock
})

afterEach(() => {
  jest.useRealTimers()
})

function renderSearch(initial = '') {
  return renderHook(({ query }) => useAdminSearch('users', query), {
    initialProps: { query: initial },
    wrapper: createQueryWrapper(),
  })
}

describe('useAdminSearch', () => {
  it('sends one request for "mor" typed a character every 100ms, with the query signal', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [result('u1', 'Morgan')] }))
    const { result: hook, rerender } = renderSearch()

    for (const query of ['m', 'mo', 'mor']) {
      rerender({ query })
      await advance(100)
    }
    expect(fetchMock).not.toHaveBeenCalled()

    await advance(210)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/search?kind=users&q=mor')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    await advance(10)
    expect(hook.current.results.map((r) => r.label)).toEqual(['Morgan'])
    expect(hook.current.q).toBe('mor')
  })

  it('keeps the earlier results visible while the next request runs', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [result('u1', 'Morgan')] }))
    const { result: hook, rerender } = renderSearch('mor')
    await advance(210)
    expect(hook.current.results.map((r) => r.label)).toEqual(['Morgan'])

    const next = deferred<Response>()
    fetchMock.mockReturnValueOnce(next.promise)
    rerender({ query: 'morg' })
    await advance(210)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(hook.current.isFetching).toBe(true)
    expect(hook.current.results.map((r) => r.label)).toEqual(['Morgan'])

    await act(async () => {
      next.resolve(jsonResponse({ results: [result('u2', 'Morgana')] }))
      await jest.advanceTimersByTimeAsync(10)
    })
    expect(hook.current.results.map((r) => r.label)).toEqual(['Morgana'])
  })

  it('sends nothing for a blank query', async () => {
    renderSearch('   ')
    await advance(500)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats a response that fails the schema as an error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [{ id: 'u1', label: 'Morgan', href: 'https://evil.example' }] }))
    const { result: hook } = renderSearch('mor')
    await advance(210)

    expect(hook.current.isError).toBe(true)
    expect(hook.current.results).toEqual([])
  })
})
