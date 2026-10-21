/**
 * The command menu's quick actions open a page's dialog through `?create=1`
 * or `?new=1` (P10.16); the param is dropped once it has been read.
 */

import { renderHook } from '@testing-library/react'

import { useOpenFromParam } from '@/hooks/use-open-from-param'

let mockParams = new URLSearchParams()
jest.mock('next/navigation', () => ({ useSearchParams: () => mockParams }))

describe('useOpenFromParam', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/admin/invites')
  })

  it('opens once and drops the param, keeping the others', () => {
    mockParams = new URLSearchParams('create=1&page=2')
    window.history.replaceState(null, '', '/admin/invites?create=1&page=2')
    const onOpen = jest.fn()

    renderHook(() => useOpenFromParam('create', onOpen))

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(window.location.search).toBe('?page=2')
  })

  it('does nothing without the param', () => {
    mockParams = new URLSearchParams('page=2')
    const onOpen = jest.fn()

    renderHook(() => useOpenFromParam('create', onOpen))

    expect(onOpen).not.toHaveBeenCalled()
  })
})
