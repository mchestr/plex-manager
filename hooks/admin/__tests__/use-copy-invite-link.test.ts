import { act, renderHook } from '@testing-library/react'

import { useCopyInviteLink } from '@/hooks/admin/use-copy-invite-link'

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const writeText = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

describe('useCopyInviteLink', () => {
  it('copies the public invite link on this origin and says so', async () => {
    writeText.mockResolvedValue(undefined)
    const { result } = renderHook(() => useCopyInviteLink())

    let copied = false
    await act(async () => {
      copied = await result.current('AUDIT2026')
    })

    expect(copied).toBe(true)
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite/AUDIT2026`)
    expect(mockShowSuccess).toHaveBeenCalledWith('Copied the link for AUDIT2026')
  })

  it('reports a refused clipboard write', async () => {
    writeText.mockRejectedValue(new Error('NotAllowedError'))
    const { result } = renderHook(() => useCopyInviteLink())

    let copied = true
    await act(async () => {
      copied = await result.current('AUDIT2026')
    })

    expect(copied).toBe(false)
    expect(mockShowSuccess).not.toHaveBeenCalled()
    expect(mockShowError).toHaveBeenCalledWith(expect.stringContaining('Could not copy the link'))
  })
})
