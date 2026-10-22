import { act, renderHook, waitFor } from '@testing-library/react'

import { useSettingsForm } from '@/hooks/admin/use-settings-form'

describe('useSettingsForm', () => {
  it('is dirty after a change and Discard restores the saved values (the JSDoc example)', () => {
    const { result } = renderHook(() => useSettingsForm({ name: 'Home' }, async () => {}))

    expect(result.current.form.isDirty).toBe(false)
    act(() => result.current.set({ name: 'Den' }))
    expect(result.current.form.isDirty).toBe(true)

    act(() => result.current.form.onDiscard())
    expect(result.current.values).toEqual({ name: 'Home' })
    expect(result.current.form.isDirty).toBe(false)
  })

  it('keeps the values a save returns, and follows new saved values', async () => {
    const save = jest.fn(async (values: { name: string; secret: string }) => ({ ...values, secret: '' }))
    const { result, rerender } = renderHook(({ initial }) => useSettingsForm(initial, save), {
      initialProps: { initial: { name: 'Home', secret: '' } },
    })

    act(() => result.current.set({ name: 'Den', secret: 'key' }))
    act(() => result.current.form.onSave())
    await waitFor(() => expect(result.current.values).toEqual({ name: 'Den', secret: '' }))
    expect(save).toHaveBeenCalledWith({ name: 'Den', secret: 'key' })

    // The refresh brings the saved name back as the initial values
    rerender({ initial: { name: 'Den', secret: '' } })
    expect(result.current.form.isDirty).toBe(false)
  })
})
