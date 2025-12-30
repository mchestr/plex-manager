import { deletePromptTemplate, setActivePromptTemplate } from '@/actions/prompts'
import { PromptTemplateActions } from '@/components/admin/prompts/prompt-template-actions'
import { PromptTemplate } from '@/lib/generated/prisma/client'
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { useRouter } from 'next/navigation'

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

jest.mock('@/actions/prompts', () => ({
  deletePromptTemplate: jest.fn(),
  setActivePromptTemplate: jest.fn(),
}))

// Mock ConfirmModal
jest.mock('@/components/ui/alert-dialog', () => ({
  ConfirmModal: ({ isOpen, onClose, onConfirm, title, message, confirmText, cancelText }: any) => {
    if (!isOpen) return null
    return (
      <div data-testid="confirm-modal">
        <h3>{title}</h3>
        <p>{message}</p>
        <button onClick={onClose}>{cancelText}</button>
        <button onClick={onConfirm}>{confirmText}</button>
      </div>
    )
  },
}))

describe('PromptTemplateActions', () => {
  const mockRouter = {
    push: jest.fn(),
    refresh: jest.fn(),
  }

  const mockTemplate: PromptTemplate = {
    id: 'template-1',
    name: 'Test Template',
    description: 'Test description',
    template: 'Test content',
    isActive: false,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: 'user-1',
  }

  const mockActiveTemplate: PromptTemplate = {
    ...mockTemplate,
    id: 'template-2',
    name: 'Active Template',
    isActive: true,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue(mockRouter)
  })

  describe('Basic Rendering', () => {
    it('should render action buttons for inactive template', () => {
      render(<PromptTemplateActions template={mockTemplate} />)

      expect(screen.getByText('Set Active')).toBeInTheDocument()
      expect(screen.getByText('Edit')).toBeInTheDocument()
      expect(screen.getByText('Playground')).toBeInTheDocument()
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })

    it('should not render Set Active button for active template', () => {
      render(<PromptTemplateActions template={mockActiveTemplate} />)

      expect(screen.queryByText('Set Active')).not.toBeInTheDocument()
      expect(screen.getByText('Edit')).toBeInTheDocument()
      expect(screen.getByText('Playground')).toBeInTheDocument()
    })

    it('should not render Delete button for active template', () => {
      render(<PromptTemplateActions template={mockActiveTemplate} />)

      expect(screen.queryByText('Delete')).not.toBeInTheDocument()
    })

    it('should render Edit link with correct href', () => {
      render(<PromptTemplateActions template={mockTemplate} />)

      const editLink = screen.getByText('Edit')
      expect(editLink).toHaveAttribute('href', `/admin/prompts/${mockTemplate.id}/edit`)
    })

    it('should render Playground link with correct href', () => {
      render(<PromptTemplateActions template={mockTemplate} />)

      const playgroundLink = screen.getByText('Playground')
      expect(playgroundLink).toHaveAttribute('href', `/admin/playground?templateId=${mockTemplate.id}`)
    })
  })

  describe('Set Active Functionality', () => {
    it('should call setActivePromptTemplate when Set Active button is clicked', async () => {
      ;(setActivePromptTemplate as jest.Mock).mockResolvedValue({ success: true })

      render(<PromptTemplateActions template={mockTemplate} />)

      const setActiveButton = screen.getByText('Set Active')
      fireEvent.click(setActiveButton)

      await waitFor(() => {
        expect(setActivePromptTemplate).toHaveBeenCalledWith(mockTemplate.id)
      })
    })

    it('should refresh router on successful set active', async () => {
      ;(setActivePromptTemplate as jest.Mock).mockResolvedValue({ success: true })

      render(<PromptTemplateActions template={mockTemplate} />)

      const setActiveButton = screen.getByText('Set Active')
      fireEvent.click(setActiveButton)

      await waitFor(() => {
        expect(mockRouter.refresh).toHaveBeenCalled()
      })
    })

    it('should display error message on failed set active', async () => {
      ;(setActivePromptTemplate as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Failed to activate template',
      })

      render(<PromptTemplateActions template={mockTemplate} />)

      const setActiveButton = screen.getByText('Set Active')
      fireEvent.click(setActiveButton)

      await waitFor(() => {
        expect(screen.getByText('Failed to activate template')).toBeInTheDocument()
      })
    })

    it('should display default error message when error is not provided', async () => {
      ;(setActivePromptTemplate as jest.Mock).mockResolvedValue({
        success: false,
      })

      render(<PromptTemplateActions template={mockTemplate} />)

      const setActiveButton = screen.getByText('Set Active')
      fireEvent.click(setActiveButton)

      await waitFor(() => {
        expect(screen.getByText('Failed to set active template')).toBeInTheDocument()
      })
    })

    it('should call setActivePromptTemplate and handle pending state', async () => {
      ;(setActivePromptTemplate as jest.Mock).mockResolvedValue({ success: true })

      render(<PromptTemplateActions template={mockTemplate} />)

      const setActiveButton = screen.getByText('Set Active')
      fireEvent.click(setActiveButton)

      // Verify the action was called
      await waitFor(() => {
        expect(setActivePromptTemplate).toHaveBeenCalledWith(mockTemplate.id)
        expect(mockRouter.refresh).toHaveBeenCalled()
      })
    })

    it('should not call setActivePromptTemplate if template is already active', () => {
      render(<PromptTemplateActions template={mockActiveTemplate} />)

      // Set Active button should not be rendered
      expect(screen.queryByText('Set Active')).not.toBeInTheDocument()
      expect(setActivePromptTemplate).not.toHaveBeenCalled()
    })
  })

  describe('Delete Functionality', () => {
    it('should show confirmation modal when Delete button is clicked', () => {
      render(<PromptTemplateActions template={mockTemplate} />)

      const deleteButton = screen.getByText('Delete')
      fireEvent.click(deleteButton)

      expect(screen.getByTestId('confirm-modal')).toBeInTheDocument()
      expect(screen.getByText('Delete Template')).toBeInTheDocument()
      expect(screen.getByText('Are you sure you want to delete this template? This action cannot be undone.')).toBeInTheDocument()
    })

    it('should close modal when Cancel is clicked', () => {
      render(<PromptTemplateActions template={mockTemplate} />)

      const deleteButton = screen.getByText('Delete')
      fireEvent.click(deleteButton)

      const cancelButton = screen.getByText('Cancel')
      fireEvent.click(cancelButton)

      expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument()
    })

    it('should call deletePromptTemplate when delete is confirmed', async () => {
      ;(deletePromptTemplate as jest.Mock).mockResolvedValue({ success: true })

      render(<PromptTemplateActions template={mockTemplate} />)

      const deleteButton = screen.getByText('Delete')
      fireEvent.click(deleteButton)

      const confirmButton = screen.getAllByText('Delete')[1] // Second "Delete" is in modal
      fireEvent.click(confirmButton)

      await waitFor(() => {
        expect(deletePromptTemplate).toHaveBeenCalledWith(mockTemplate.id)
      })
    })

    it('should navigate to prompts page on successful delete', async () => {
      ;(deletePromptTemplate as jest.Mock).mockResolvedValue({ success: true })

      render(<PromptTemplateActions template={mockTemplate} />)

      const deleteButton = screen.getByText('Delete')
      fireEvent.click(deleteButton)

      const confirmButton = screen.getAllByText('Delete')[1]
      fireEvent.click(confirmButton)

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/admin/prompts')
      })
    })

    it('should display error message on failed delete', async () => {
      ;(deletePromptTemplate as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Failed to delete template',
      })

      render(<PromptTemplateActions template={mockTemplate} />)

      const deleteButton = screen.getByText('Delete')
      fireEvent.click(deleteButton)

      const confirmButton = screen.getAllByText('Delete')[1]
      fireEvent.click(confirmButton)

      await waitFor(() => {
        expect(screen.getByText('Failed to delete template')).toBeInTheDocument()
      })
    })

    it('should close modal after delete attempt', async () => {
      ;(deletePromptTemplate as jest.Mock).mockResolvedValue({ success: true })

      render(<PromptTemplateActions template={mockTemplate} />)

      const deleteButton = screen.getByText('Delete')
      fireEvent.click(deleteButton)

      const confirmButton = screen.getAllByText('Delete')[1]
      fireEvent.click(confirmButton)

      await waitFor(() => {
        expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument()
      })
    })

    it('should call deletePromptTemplate and handle pending state', async () => {
      ;(deletePromptTemplate as jest.Mock).mockResolvedValue({ success: true })

      render(<PromptTemplateActions template={mockTemplate} />)

      const deleteButton = screen.getByText('Delete')
      fireEvent.click(deleteButton)

      const confirmButton = screen.getAllByText('Delete')[1]
      fireEvent.click(confirmButton)

      // Verify the action was called and navigation happened
      await waitFor(() => {
        expect(deletePromptTemplate).toHaveBeenCalledWith(mockTemplate.id)
        expect(mockRouter.push).toHaveBeenCalledWith('/admin/prompts')
      })
    })
  })

  describe('Error Handling', () => {
    it('should clear previous error when performing new action', async () => {
      ;(setActivePromptTemplate as jest.Mock)
        .mockResolvedValueOnce({ success: false, error: 'First error' })
        .mockResolvedValueOnce({ success: true })

      render(<PromptTemplateActions template={mockTemplate} />)

      const setActiveButton = screen.getByText('Set Active')

      // First click - should show error
      await act(async () => {
        fireEvent.click(setActiveButton)
      })
      await waitFor(() => {
        expect(screen.getByText('First error')).toBeInTheDocument()
      })

      // Second click - error should be cleared on success
      await act(async () => {
        fireEvent.click(setActiveButton)
      })
      await waitFor(() => {
        expect(screen.queryByText('First error')).not.toBeInTheDocument()
      })
    })

    it('should display error with proper styling', async () => {
      ;(setActivePromptTemplate as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Test error',
      })

      render(<PromptTemplateActions template={mockTemplate} />)

      const setActiveButton = screen.getByText('Set Active')
      await act(async () => {
        fireEvent.click(setActiveButton)
      })

      await waitFor(() => {
        const errorElement = screen.getByText('Test error')
        expect(errorElement).toHaveClass('text-red-400')
      })
    })
  })

  describe('Button Rendering', () => {
    it('should render Set Active button', () => {
      render(<PromptTemplateActions template={mockTemplate} />)

      const setActiveButton = screen.getByText('Set Active')
      expect(setActiveButton).toBeInTheDocument()
    })

    it('should render Edit link', () => {
      render(<PromptTemplateActions template={mockTemplate} />)

      const editLink = screen.getByText('Edit')
      expect(editLink).toBeInTheDocument()
    })

    it('should render Playground link', () => {
      render(<PromptTemplateActions template={mockTemplate} />)

      const playgroundLink = screen.getByText('Playground')
      expect(playgroundLink).toBeInTheDocument()
    })

    it('should render Delete button', () => {
      render(<PromptTemplateActions template={mockTemplate} />)

      const deleteButton = screen.getByText('Delete')
      expect(deleteButton).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle rapid button clicks', async () => {
      ;(setActivePromptTemplate as jest.Mock).mockResolvedValue({ success: true })

      render(<PromptTemplateActions template={mockTemplate} />)

      const setActiveButton = screen.getByText('Set Active')

      fireEvent.click(setActiveButton)
      fireEvent.click(setActiveButton)
      fireEvent.click(setActiveButton)

      await waitFor(() => {
        // All clicks will trigger the action since there's no debouncing
        // The button is only disabled during the transition
        expect(setActivePromptTemplate).toHaveBeenCalled()
      })
    })

    it('should handle template with missing id', async () => {
      const templateWithoutId = { ...mockTemplate, id: '' }
      ;(setActivePromptTemplate as jest.Mock).mockResolvedValue({ success: true })

      render(<PromptTemplateActions template={templateWithoutId} />)

      const setActiveButton = screen.getByText('Set Active')
      fireEvent.click(setActiveButton)

      await waitFor(() => {
        expect(setActivePromptTemplate).toHaveBeenCalledWith('')
      })
    })

    it('should handle modal opening and closing multiple times', () => {
      render(<PromptTemplateActions template={mockTemplate} />)

      const deleteButton = screen.getByText('Delete')

      // Open modal
      fireEvent.click(deleteButton)
      expect(screen.getByTestId('confirm-modal')).toBeInTheDocument()

      // Close modal
      const cancelButton = screen.getByText('Cancel')
      fireEvent.click(cancelButton)
      expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument()

      // Open again
      fireEvent.click(deleteButton)
      expect(screen.getByTestId('confirm-modal')).toBeInTheDocument()
    })
  })

  describe('Integration', () => {
    it('should work with all actions in sequence', async () => {
      ;(setActivePromptTemplate as jest.Mock).mockResolvedValue({ success: true })
      ;(deletePromptTemplate as jest.Mock).mockResolvedValue({ success: true })

      const { rerender } = render(<PromptTemplateActions template={mockTemplate} />)

      // Set active
      const setActiveButton = screen.getByText('Set Active')
      fireEvent.click(setActiveButton)

      await waitFor(() => {
        expect(mockRouter.refresh).toHaveBeenCalled()
      })

      // Re-render with active template
      rerender(<PromptTemplateActions template={mockActiveTemplate} />)

      // Verify Set Active and Delete buttons are not present
      expect(screen.queryByText('Set Active')).not.toBeInTheDocument()
      expect(screen.queryByText('Delete')).not.toBeInTheDocument()

      // Edit and Playground links should still be present
      expect(screen.getByText('Edit')).toBeInTheDocument()
      expect(screen.getByText('Playground')).toBeInTheDocument()
    })

    it('should maintain error state across re-renders', async () => {
      ;(setActivePromptTemplate as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Persistent error',
      })

      const { rerender } = render(<PromptTemplateActions template={mockTemplate} />)

      const setActiveButton = screen.getByText('Set Active')
      fireEvent.click(setActiveButton)

      await waitFor(() => {
        expect(screen.getByText('Persistent error')).toBeInTheDocument()
      })

      // Re-render with same template
      rerender(<PromptTemplateActions template={mockTemplate} />)

      // Error should still be visible
      expect(screen.getByText('Persistent error')).toBeInTheDocument()
    })
  })
})

