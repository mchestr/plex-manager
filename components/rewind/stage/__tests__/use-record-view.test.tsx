import { renderHook } from '@testing-library/react'

import { useRecordView, type ViewTracking } from '@/components/rewind/stage/use-record-view'

type RecordInput = Parameters<ViewTracking['record']>[0]

const record = jest.fn(async (_input: RecordInput) => ({ success: true as const, data: null }))
const tracking: ViewTracking = { rewindId: 'wrapped-1', record }
const inputs = () => record.mock.calls.map(([input]) => input)

beforeEach(() => record.mockClear())

describe('useRecordView', () => {
  it('records each page once per open, under one session key', () => {
    const { rerender } = renderHook(({ index }) => useRecordView(tracking, index), { initialProps: { index: 0 } })
    rerender({ index: 1 })
    rerender({ index: 0 })
    rerender({ index: 1 })
    rerender({ index: 2 })

    expect(inputs().map((input) => input.page)).toEqual([1, 2, 3])
    const keys = new Set(inputs().map((input) => input.sessionKey))
    expect(keys.size).toBe(1)
    expect([...keys].at(0)).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('makes a new session key for a new open', () => {
    renderHook(() => useRecordView(tracking, 0)).unmount()
    renderHook(() => useRecordView(tracking, 0))

    const [first, second] = inputs()
    expect(record).toHaveBeenCalledTimes(2)
    expect(first?.sessionKey).not.toBe(second?.sessionKey)
  })

  it('passes share actions on the current page', () => {
    const { result } = renderHook(() => useRecordView(tracking, 4))

    result.current('image')

    expect(record).toHaveBeenLastCalledWith({ wrappedId: 'wrapped-1', sessionKey: inputs().at(0)?.sessionKey, page: 5, shareAction: 'image' })
  })

  it('records nothing without tracking (previews)', () => {
    const { result, rerender } = renderHook(({ index }) => useRecordView(null, index), { initialProps: { index: 0 } })
    rerender({ index: 1 })
    result.current('link')

    expect(record).not.toHaveBeenCalled()
  })
})
