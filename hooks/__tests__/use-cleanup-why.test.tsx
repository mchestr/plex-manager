/** The Why Sheet query (TS 10.5, 10.7): idle while closed, the action's input, a new ask on a draft change, and the refusal. */

import { renderHook, waitFor } from '@testing-library/react'

import { getCleanupItemWhy } from '@/actions/admin/cleanup-preview'
import { createQueryWrapper } from '@/__tests__/helpers/query-client'
import { CleanupWhyFailed, useCleanupWhy } from '@/hooks/use-cleanup-why'
import type { WhySheetData } from '@/lib/cleanup/types/preview'
import type { RuleDraft } from '@/lib/validations/cleanup-draft'

jest.mock('@/actions/admin/cleanup-preview', () => ({ getCleanupItemWhy: jest.fn() }))

const getWhy = jest.mocked(getCleanupItemWhy)
const WHY = { state: 'match' } as unknown as WhySheetData
const DRAFT: RuleDraft = { schemaVersion: 1, level: 'movie', libraries: ['1'], conditions: [], protections: [], then: {} }

beforeEach(() => {
  getWhy.mockReset()
  getWhy.mockResolvedValue({ success: true, data: WHY })
})

describe('useCleanupWhy', () => {
  it('stays idle while no title is open', async () => {
    const { result } = renderHook(() => useCleanupWhy({ itemKey: null, scope: 'new' }), { wrapper: createQueryWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(getWhy).not.toHaveBeenCalled()
  })

  it('asks with the saved rule, the draft or the outcome', async () => {
    const { result } = renderHook(() => useCleanupWhy({ itemKey: 'movie:tmdb:1', scope: 'rule-1', ruleId: 'rule-1' }), { wrapper: createQueryWrapper() })
    await waitFor(() => expect(result.current.data).toEqual(WHY))
    expect(getWhy).toHaveBeenCalledWith({ itemKey: 'movie:tmdb:1', ruleId: 'rule-1' })

    renderHook(() => useCleanupWhy({ itemKey: 'movie:tmdb:2', scope: 'new', definition: DRAFT }), { wrapper: createQueryWrapper() })
    await waitFor(() => expect(getWhy).toHaveBeenCalledWith({ itemKey: 'movie:tmdb:2', definition: DRAFT }))

    renderHook(() => useCleanupWhy({ itemKey: 'movie:tmdb:3', scope: 'history', outcomeId: 'o-1' }), { wrapper: createQueryWrapper() })
    await waitFor(() => expect(getWhy).toHaveBeenCalledWith({ itemKey: 'movie:tmdb:3', outcomeId: 'o-1' }))
  })

  it('asks again when the draft changes', async () => {
    const { rerender } = renderHook(({ definition }) => useCleanupWhy({ itemKey: 'movie:tmdb:1', scope: 'new', definition }), {
      wrapper: createQueryWrapper(), initialProps: { definition: DRAFT },
    })
    await waitFor(() => expect(getWhy).toHaveBeenCalledTimes(1))
    rerender({ definition: { ...DRAFT, libraries: ['2'] } })
    await waitFor(() => expect(getWhy).toHaveBeenCalledTimes(2))
  })

  it('throws the refusal as CleanupWhyFailed with its code and safe words', async () => {
    getWhy.mockResolvedValue({ success: false, code: 'NOT_FOUND', error: 'This title is not in the library data.' })
    const { result } = renderHook(() => useCleanupWhy({ itemKey: 'movie:tmdb:1', scope: 'new' }), { wrapper: createQueryWrapper() })
    await waitFor(() => expect(result.current.error).toBeInstanceOf(CleanupWhyFailed))
    expect(result.current.error).toMatchObject({ code: 'NOT_FOUND', message: 'This title is not in the library data.' })
  })
})
