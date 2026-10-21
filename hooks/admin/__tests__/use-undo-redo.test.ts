import { act, renderHook } from '@testing-library/react'

import { useUndoRedo } from '@/hooks/admin/use-undo-redo'

let now = 0
beforeEach(() => {
  now = 0
  jest.spyOn(Date, 'now').mockImplementation(() => now)
})
afterEach(() => jest.restoreAllMocks())

/** Types `value` at `at` ms. */
function typeAt(set: (value: string) => void, value: string, at: number) {
  now = at
  act(() => set(value))
}

describe('useUndoRedo', () => {
  it('pushes separate steps and undoes them in order', () => {
    const { result } = renderHook(() => useUndoRedo('a'))
    typeAt(result.current.set, 'ab', 1000)
    typeAt(result.current.set, 'abc', 2000)

    expect(result.current.value).toBe('abc')
    act(() => result.current.undo())
    expect(result.current.value).toBe('ab')
    act(() => result.current.undo())
    expect(result.current.value).toBe('a')
  })

  it('coalesces changes within 500 ms into one step', () => {
    const { result } = renderHook(() => useUndoRedo(''))
    typeAt(result.current.set, 'h', 1000)
    typeAt(result.current.set, 'he', 1200)
    typeAt(result.current.set, 'hey', 1600)
    typeAt(result.current.set, 'hey you', 3000)

    act(() => result.current.undo())
    expect(result.current.value).toBe('hey')
    act(() => result.current.undo())
    expect(result.current.value).toBe('')
    expect(result.current.canUndo).toBe(false)
  })

  it('stops at both ends and clears redo on a new change', () => {
    const { result } = renderHook(() => useUndoRedo('a'))
    expect(result.current.canUndo).toBe(false)
    act(() => result.current.undo())
    expect(result.current.value).toBe('a')

    typeAt(result.current.set, 'b', 1000)
    act(() => result.current.undo())
    expect(result.current.canRedo).toBe(true)
    act(() => result.current.redo())
    expect(result.current.value).toBe('b')
    act(() => result.current.redo())
    expect(result.current.value).toBe('b')

    act(() => result.current.undo())
    typeAt(result.current.set, 'c', 5000)
    expect(result.current.canRedo).toBe(false)
  })

  it('keeps at most 100 steps', () => {
    const { result } = renderHook(() => useUndoRedo('0'))
    for (let i = 1; i <= 150; i++) typeAt(result.current.set, String(i), i * 1000)

    let undone = 0
    while (result.current.canUndo) {
      act(() => result.current.undo())
      undone++
    }
    expect(undone).toBe(100)
    expect(result.current.value).toBe('50')
  })

  it('starts a fresh history on reset (after a save)', () => {
    const { result } = renderHook(() => useUndoRedo('a'))
    typeAt(result.current.set, 'b', 1000)
    act(() => result.current.reset('saved'))

    expect(result.current.value).toBe('saved')
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })
})
