import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter, useSearchParams } from 'next/navigation'
import { CostDateFilter } from '@/components/admin/cost-analysis/cost-date-filter'

// Mock Next.js navigation hooks
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}))

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>
const mockUseSearchParams = useSearchParams as jest.MockedFunction<typeof useSearchParams>

describe('CostDateFilter', () => {
  const mockPush = jest.fn()
  const mockSearchParams = new URLSearchParams()

  beforeEach(() => {
    jest.clearAllMocks()
    mockPush.mockClear()
    mockSearchParams.toString = jest.fn().mockReturnValue('')

    mockUseRouter.mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    } as any)

    mockUseSearchParams.mockReturnValue({
      get: jest.fn().mockReturnValue(null),
      toString: jest.fn().mockReturnValue(''),
    } as any)
  })

  describe('Rendering', () => {
    it('should render date filter with start and end date inputs', () => {
      render(<CostDateFilter />)

      expect(screen.getByText('Start date')).toBeInTheDocument()
      expect(screen.getByText('End date')).toBeInTheDocument()
      expect(screen.getByText('Quick Filters:')).toBeInTheDocument()
    })

    it('should render quick filter buttons', () => {
      render(<CostDateFilter />)

      expect(screen.getByText('7 Days')).toBeInTheDocument()
      expect(screen.getByText('30 Days')).toBeInTheDocument()
      expect(screen.getByText('90 Days')).toBeInTheDocument()
    })

    it('should not render clear button when no dates are set', () => {
      render(<CostDateFilter />)

      expect(screen.queryByText('Clear')).not.toBeInTheDocument()
    })

    it('should render clear button when start date is set', () => {
      mockUseSearchParams.mockReturnValue({
        get: jest.fn((key) => (key === 'startDate' ? '2024-01-01' : null)),
        toString: jest.fn().mockReturnValue('startDate=2024-01-01'),
      } as any)

      render(<CostDateFilter />)

      expect(screen.getByText('Clear')).toBeInTheDocument()
    })

    it('should render clear button when end date is set', () => {
      mockUseSearchParams.mockReturnValue({
        get: jest.fn((key) => (key === 'endDate' ? '2024-12-31' : null)),
        toString: jest.fn().mockReturnValue('endDate=2024-12-31'),
      } as any)

      render(<CostDateFilter />)

      expect(screen.getByText('Clear')).toBeInTheDocument()
    })

    it('should display existing start date from search params', () => {
      mockUseSearchParams.mockReturnValue({
        get: jest.fn((key) => (key === 'startDate' ? '2024-01-01' : null)),
        toString: jest.fn().mockReturnValue('startDate=2024-01-01'),
      } as any)

      const { container } = render(<CostDateFilter />)

      const startDateInput = container.querySelectorAll('input[type="date"]')[0] as HTMLInputElement
      expect(startDateInput.value).toBe('2024-01-01')
    })

    it('should display existing end date from search params', () => {
      mockUseSearchParams.mockReturnValue({
        get: jest.fn((key) => (key === 'endDate' ? '2024-12-31' : null)),
        toString: jest.fn().mockReturnValue('endDate=2024-12-31'),
      } as any)

      const { container } = render(<CostDateFilter />)

      const endDateInput = container.querySelectorAll('input[type="date"]')[1] as HTMLInputElement
      expect(endDateInput.value).toBe('2024-12-31')
    })
  })

  describe('Date Input Changes', () => {
    it('should update start date and navigate with new params', async () => {
      const user = userEvent.setup()
      const { container } = render(<CostDateFilter />)

      const startDateInput = container.querySelectorAll('input[type="date"]')[0]
      await user.type(startDateInput, '2024-01-01')

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/admin/cost-analysis?startDate=2024-01-01')
      })
    })

    it('should update end date and navigate with new params', async () => {
      const user = userEvent.setup()
      const { container } = render(<CostDateFilter />)

      const endDateInput = container.querySelectorAll('input[type="date"]')[1]
      await user.type(endDateInput, '2024-12-31')

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/admin/cost-analysis?endDate=2024-12-31')
      })
    })

    it('should preserve existing end date when updating start date', async () => {
      const user = userEvent.setup()
      mockUseSearchParams.mockReturnValue({
        get: jest.fn((key) => (key === 'endDate' ? '2024-12-31' : null)),
        toString: jest.fn().mockReturnValue('endDate=2024-12-31'),
      } as any)

      const { container } = render(<CostDateFilter />)

      const startDateInput = container.querySelectorAll('input[type="date"]')[0]
      await user.type(startDateInput, '2024-01-01')

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('startDate=2024-01-01')
        )
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('endDate=2024-12-31')
        )
      })
    })

    it('should preserve existing start date when updating end date', async () => {
      const user = userEvent.setup()
      mockUseSearchParams.mockReturnValue({
        get: jest.fn((key) => (key === 'startDate' ? '2024-01-01' : null)),
        toString: jest.fn().mockReturnValue('startDate=2024-01-01'),
      } as any)

      const { container } = render(<CostDateFilter />)

      const endDateInput = container.querySelectorAll('input[type="date"]')[1]
      await user.type(endDateInput, '2024-12-31')

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('startDate=2024-01-01')
        )
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('endDate=2024-12-31')
        )
      })
    })

    it('should remove start date param when cleared', async () => {
      const user = userEvent.setup()
      mockUseSearchParams.mockReturnValue({
        get: jest.fn((key) => (key === 'startDate' ? '2024-01-01' : null)),
        toString: jest.fn().mockReturnValue('startDate=2024-01-01'),
      } as any)

      const { container } = render(<CostDateFilter />)

      const startDateInput = container.querySelectorAll('input[type="date"]')[0]
      await user.clear(startDateInput)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/admin/cost-analysis?')
      })
    })

    it('should remove end date param when cleared', async () => {
      const user = userEvent.setup()
      mockUseSearchParams.mockReturnValue({
        get: jest.fn((key) => (key === 'endDate' ? '2024-12-31' : null)),
        toString: jest.fn().mockReturnValue('endDate=2024-12-31'),
      } as any)

      const { container } = render(<CostDateFilter />)

      const endDateInput = container.querySelectorAll('input[type="date"]')[1]
      await user.clear(endDateInput)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/admin/cost-analysis?')
      })
    })
  })

  describe('Quick Filters', () => {
    beforeEach(() => {
      // Mock Date to have consistent test results
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should apply 7 days filter', async () => {
      const user = userEvent.setup({ delay: null })
      render(<CostDateFilter />)

      const sevenDaysButton = screen.getByText('7 Days')
      await user.click(sevenDaysButton)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('startDate=2024-06-08')
        )
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('endDate=2024-06-15')
        )
      })
    })

    it('should apply 30 days filter', async () => {
      const user = userEvent.setup({ delay: null })
      render(<CostDateFilter />)

      const thirtyDaysButton = screen.getByText('30 Days')
      await user.click(thirtyDaysButton)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('startDate=2024-05-16')
        )
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('endDate=2024-06-15')
        )
      })
    })

    it('should apply 90 days filter', async () => {
      const user = userEvent.setup({ delay: null })
      render(<CostDateFilter />)

      const ninetyDaysButton = screen.getByText('90 Days')
      await user.click(ninetyDaysButton)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('startDate=2024-03-17')
        )
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('endDate=2024-06-15')
        )
      })
    })
  })

  describe('Clear Button', () => {
    it('should clear both dates when clicked', async () => {
      const user = userEvent.setup()
      mockUseSearchParams.mockReturnValue({
        get: jest.fn((key) => {
          if (key === 'startDate') return '2024-01-01'
          if (key === 'endDate') return '2024-12-31'
          return null
        }),
        toString: jest.fn().mockReturnValue('startDate=2024-01-01&endDate=2024-12-31'),
      } as any)

      render(<CostDateFilter />)

      const clearButton = screen.getByText('Clear')
      await user.click(clearButton)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/admin/cost-analysis?')
      })
    })

    it('should preserve other query params when clearing dates', async () => {
      const user = userEvent.setup()
      mockUseSearchParams.mockReturnValue({
        get: jest.fn((key) => {
          if (key === 'startDate') return '2024-01-01'
          if (key === 'endDate') return '2024-12-31'
          return null
        }),
        toString: jest
          .fn()
          .mockReturnValue('startDate=2024-01-01&endDate=2024-12-31&other=value'),
      } as any)

      render(<CostDateFilter />)

      const clearButton = screen.getByText('Clear')
      await user.click(clearButton)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('other=value'))
        expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('startDate'))
        expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('endDate'))
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty string dates', async () => {
      mockUseSearchParams.mockReturnValue({
        get: jest.fn().mockReturnValue(''),
        toString: jest.fn().mockReturnValue(''),
      } as any)

      const { container } = render(<CostDateFilter />)

      const startDateInput = container.querySelectorAll('input[type="date"]')[0] as HTMLInputElement
      expect(startDateInput.value).toBe('')
    })

    it('should handle multiple rapid filter changes', async () => {
      const user = userEvent.setup({ delay: null })
      render(<CostDateFilter />)

      const sevenDaysButton = screen.getByText('7 Days')
      const thirtyDaysButton = screen.getByText('30 Days')

      await user.click(sevenDaysButton)
      await user.click(thirtyDaysButton)

      // Should have been called twice
      expect(mockPush).toHaveBeenCalledTimes(2)
    })

    it('should call router push when filter is applied', async () => {
      const user = userEvent.setup({ delay: null })
      render(<CostDateFilter />)

      const sevenDaysButton = screen.getByText('7 Days')
      await user.click(sevenDaysButton)

      // Should have called push at least once
      expect(mockPush).toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    it('should have labels for date inputs', () => {
      render(<CostDateFilter />)

      expect(screen.getByText('Start date')).toBeInTheDocument()
      expect(screen.getByText('End date')).toBeInTheDocument()
    })

    it('should have date input fields', () => {
      const { container } = render(<CostDateFilter />)

      const dateInputs = container.querySelectorAll('input[type="date"]')
      expect(dateInputs).toHaveLength(2)
    })

    it('should have clickable buttons', () => {
      render(<CostDateFilter />)

      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
      buttons.forEach((button) => {
        expect(button).toBeEnabled()
      })
    })

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup()
      render(<CostDateFilter />)

      // Focus should work on first input
      await user.tab()
      expect(document.activeElement).toBeTruthy()

      // Should be able to tab to next input
      await user.tab()
      expect(document.activeElement).toBeTruthy()
    })
  })
})

