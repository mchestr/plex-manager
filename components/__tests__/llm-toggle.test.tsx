import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LLMToggle } from '../admin/settings/llm-toggle'
import * as adminActions from '@/actions/admin'
import { ToastProvider } from '@/components/ui/toast'

// Mock the admin actions
jest.mock('@/actions/admin', () => ({
  setLLMDisabled: jest.fn(),
}))

// Mock the toast hook
const mockShowError = jest.fn()
const mockShowSuccess = jest.fn()

jest.mock('@/components/ui/toast', () => {
  const actual = jest.requireActual('@/components/ui/toast')
  return {
    ...actual,
    useToast: () => ({
      showToast: jest.fn(),
      showSuccess: mockShowSuccess,
      showError: mockShowError,
      showInfo: jest.fn(),
    }),
  }
})

const renderWithToast = (component: React.ReactElement) => {
  return render(<ToastProvider>{component}</ToastProvider>)
}

describe('LLMToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render toggle with initial disabled state', () => {
    renderWithToast(<LLMToggle initialDisabled={true} />)
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeChecked()
    expect(screen.getByText('OFF')).toBeInTheDocument()
  })

  it('should render toggle with initial enabled state', () => {
    renderWithToast(<LLMToggle initialDisabled={false} />)
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).not.toBeChecked()
    expect(screen.getByText('ON')).toBeInTheDocument()
  })

  it('should call setLLMDisabled when toggled', async () => {
    const user = userEvent.setup()
    const mockSetLLMDisabled = jest.spyOn(adminActions, 'setLLMDisabled').mockResolvedValue({
      success: true,
      config: { id: 'config', llmDisabled: true, updatedAt: new Date(), updatedBy: null },
    })

    renderWithToast(<LLMToggle initialDisabled={false} />)
    const checkbox = screen.getByRole('checkbox')

    await user.click(checkbox)

    await waitFor(() => {
      expect(mockSetLLMDisabled).toHaveBeenCalledWith(true)
    })
  })

  it('should update state when toggle succeeds', async () => {
    const user = userEvent.setup()
    jest.spyOn(adminActions, 'setLLMDisabled').mockResolvedValue({
      success: true,
      config: { id: 'config', llmDisabled: true, updatedAt: new Date(), updatedBy: null },
    })

    renderWithToast(<LLMToggle initialDisabled={false} />)
    const checkbox = screen.getByRole('checkbox')

    await user.click(checkbox)

    await waitFor(() => {
      expect(checkbox).toBeChecked()
      expect(screen.getByText('OFF')).toBeInTheDocument()
    })
  })

  it('should show error toast when toggle fails', async () => {
    const user = userEvent.setup()
    jest.spyOn(adminActions, 'setLLMDisabled').mockResolvedValue({
      success: false,
      error: 'Failed to update',
    })

    renderWithToast(<LLMToggle initialDisabled={false} />)
    const checkbox = screen.getByRole('checkbox')

    await user.click(checkbox)

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Failed to update')
    })
  })

  it('should show generic error toast when error is not provided', async () => {
    const user = userEvent.setup()
    jest.spyOn(adminActions, 'setLLMDisabled').mockResolvedValue({
      success: false,
    } as any)

    renderWithToast(<LLMToggle initialDisabled={false} />)
    const checkbox = screen.getByRole('checkbox')

    await user.click(checkbox)

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Failed to update setting')
    })
  })

  it('should show error toast when exception occurs', async () => {
    const user = userEvent.setup()
    jest.spyOn(adminActions, 'setLLMDisabled').mockRejectedValue(new Error('Network error'))

    renderWithToast(<LLMToggle initialDisabled={false} />)
    const checkbox = screen.getByRole('checkbox')

    await user.click(checkbox)

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('Failed to update setting')
    })
  })

  it('should disable checkbox while saving', async () => {
    const user = userEvent.setup()
    let resolveSetLLMDisabled: (value: any) => void
    const setLLMPromise = new Promise<any>((resolve) => {
      resolveSetLLMDisabled = resolve
    })
    jest.spyOn(adminActions, 'setLLMDisabled').mockReturnValue(setLLMPromise)

    renderWithToast(<LLMToggle initialDisabled={false} />)
    const checkbox = screen.getByRole('checkbox')

    await user.click(checkbox)

    await waitFor(() => {
      expect(checkbox).toBeDisabled()
    })

    resolveSetLLMDisabled!({ success: true, config: { id: 'config', llmDisabled: true, updatedAt: new Date(), updatedBy: null } })
  })

  it('should show loading spinner while saving', async () => {
    const user = userEvent.setup()
    let resolveSetLLMDisabled: (value: any) => void
    const setLLMPromise = new Promise<any>((resolve) => {
      resolveSetLLMDisabled = resolve
    })
    jest.spyOn(adminActions, 'setLLMDisabled').mockReturnValue(setLLMPromise)

    renderWithToast(<LLMToggle initialDisabled={false} />)
    const checkbox = screen.getByRole('checkbox')

    await user.click(checkbox)

    await waitFor(() => {
      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })

    resolveSetLLMDisabled!({ success: true, config: { id: 'config', llmDisabled: true, updatedAt: new Date(), updatedBy: null } })
  })

  it('should apply correct styling for OFF state', () => {
    renderWithToast(<LLMToggle initialDisabled={true} />)
    const statusText = screen.getByText('OFF')
    expect(statusText).toHaveClass('text-red-400')
  })

  it('should apply correct styling for ON state', () => {
    renderWithToast(<LLMToggle initialDisabled={false} />)
    const statusText = screen.getByText('ON')
    expect(statusText).toHaveClass('text-green-400')
  })
})

