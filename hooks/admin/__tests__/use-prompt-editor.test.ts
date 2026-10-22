import { act, renderHook, waitFor } from '@testing-library/react'

import { usePromptEditor, type PromptEditorValues, type PromptSaveResult } from '@/hooks/admin/use-prompt-editor'

const initial: PromptEditorValues = { name: 'House style', description: '', template: 'Short.', isActive: false }

function setup(save: (v: PromptEditorValues) => Promise<PromptSaveResult>, onSaved = jest.fn()) {
  return renderHook(({ values }) => usePromptEditor({ initial, values, save, onSaved }), {
    initialProps: { values: initial },
  })
}

describe('usePromptEditor', () => {
  it('goes idle, dirty, saving and saved', async () => {
    let resolve: (r: PromptSaveResult) => void = () => {}
    const save = jest.fn(() => new Promise<PromptSaveResult>((r) => (resolve = r)))
    const onSaved = jest.fn()
    const { result, rerender } = setup(save, onSaved)
    expect(result.current.status).toBe('idle')

    const edited = { ...initial, template: 'Short. Warm.' }
    rerender({ values: edited })
    expect(result.current.status).toBe('dirty')

    act(() => result.current.submit())
    await waitFor(() => expect(result.current.status).toBe('saving'))
    expect(save).toHaveBeenCalledWith(edited)

    await act(async () => resolve({ success: true, data: { id: 'g1' } }))
    await waitFor(() => expect(result.current.status).toBe('saved'))
    expect(result.current.dirty).toBe(false)
    expect(onSaved).toHaveBeenCalledWith('g1', edited)
  })

  it('keeps the text and the field errors when the save fails', async () => {
    const save = jest.fn(async (): Promise<PromptSaveResult> => ({
      success: false,
      error: 'A style guide is at most 1,200 characters',
      fieldErrors: { template: ['A style guide is at most 1,200 characters'] },
    }))
    const { result, rerender } = setup(save)
    const edited = { ...initial, template: 'a'.repeat(1201) }
    rerender({ values: edited })

    await act(async () => result.current.submit())

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('A style guide is at most 1,200 characters')
    expect(result.current.fieldErrors.template).toEqual(['A style guide is at most 1,200 characters'])
    expect(result.current.dirty).toBe(true)
  })

  it('warns before leaving only while there are unsaved changes', () => {
    const add = jest.spyOn(window, 'addEventListener')
    const { rerender } = setup(jest.fn())
    expect(add).not.toHaveBeenCalledWith('beforeunload', expect.any(Function))

    rerender({ values: { ...initial, name: 'Renamed' } })
    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function))

    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    add.mockRestore()
  })
})
