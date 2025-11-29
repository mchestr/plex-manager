import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pagination } from '@/components/ui/pagination'

const defaultProps = {
  page: 1,
  pageSize: 25,
  totalCount: 100,
  totalPages: 4,
  hasNextPage: true,
  hasPreviousPage: false,
  onPageChange: jest.fn(),
}

describe('Pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Display', () => {
    it('should display correct page information', () => {
      render(<Pagination {...defaultProps} />)

      expect(screen.getByTestId('pagination-info')).toHaveTextContent(
        'Showing 1 to 25 of 100 results'
      )
      expect(screen.getByTestId('pagination-current-page')).toHaveTextContent('1')
      expect(screen.getByTestId('pagination-total-pages')).toHaveTextContent('4')
    })

    it('should display correct range for middle page', () => {
      render(<Pagination {...defaultProps} page={2} hasPreviousPage={true} />)

      expect(screen.getByTestId('pagination-info')).toHaveTextContent(
        'Showing 26 to 50 of 100 results'
      )
    })

    it('should display correct range for last page with partial results', () => {
      render(
        <Pagination
          {...defaultProps}
          page={4}
          hasNextPage={false}
          hasPreviousPage={true}
        />
      )

      expect(screen.getByTestId('pagination-info')).toHaveTextContent(
        'Showing 76 to 100 of 100 results'
      )
    })

    it('should display 0 to 0 of 0 when empty', () => {
      render(
        <Pagination
          {...defaultProps}
          page={1}
          totalCount={0}
          totalPages={0}
          hasNextPage={false}
          hasPreviousPage={false}
        />
      )

      expect(screen.getByTestId('pagination-info')).toHaveTextContent(
        'Showing 0 to 0 of 0 results'
      )
    })
  })

  describe('Navigation Buttons', () => {
    it('should disable previous and first buttons on first page', () => {
      render(<Pagination {...defaultProps} />)

      expect(screen.getByTestId('pagination-first')).toBeDisabled()
      expect(screen.getByTestId('pagination-previous')).toBeDisabled()
      expect(screen.getByTestId('pagination-next')).not.toBeDisabled()
      expect(screen.getByTestId('pagination-last')).not.toBeDisabled()
    })

    it('should disable next and last buttons on last page', () => {
      render(
        <Pagination
          {...defaultProps}
          page={4}
          hasNextPage={false}
          hasPreviousPage={true}
        />
      )

      expect(screen.getByTestId('pagination-first')).not.toBeDisabled()
      expect(screen.getByTestId('pagination-previous')).not.toBeDisabled()
      expect(screen.getByTestId('pagination-next')).toBeDisabled()
      expect(screen.getByTestId('pagination-last')).toBeDisabled()
    })

    it('should enable all navigation buttons on middle page', () => {
      render(
        <Pagination {...defaultProps} page={2} hasNextPage={true} hasPreviousPage={true} />
      )

      expect(screen.getByTestId('pagination-first')).not.toBeDisabled()
      expect(screen.getByTestId('pagination-previous')).not.toBeDisabled()
      expect(screen.getByTestId('pagination-next')).not.toBeDisabled()
      expect(screen.getByTestId('pagination-last')).not.toBeDisabled()
    })
  })

  describe('Navigation Actions', () => {
    it('should call onPageChange with 1 when clicking first button', async () => {
      const user = userEvent.setup()
      const onPageChange = jest.fn()

      render(
        <Pagination
          {...defaultProps}
          page={3}
          hasPreviousPage={true}
          onPageChange={onPageChange}
        />
      )

      await user.click(screen.getByTestId('pagination-first'))

      expect(onPageChange).toHaveBeenCalledWith(1)
    })

    it('should call onPageChange with page-1 when clicking previous button', async () => {
      const user = userEvent.setup()
      const onPageChange = jest.fn()

      render(
        <Pagination
          {...defaultProps}
          page={3}
          hasPreviousPage={true}
          onPageChange={onPageChange}
        />
      )

      await user.click(screen.getByTestId('pagination-previous'))

      expect(onPageChange).toHaveBeenCalledWith(2)
    })

    it('should call onPageChange with page+1 when clicking next button', async () => {
      const user = userEvent.setup()
      const onPageChange = jest.fn()

      render(<Pagination {...defaultProps} onPageChange={onPageChange} />)

      await user.click(screen.getByTestId('pagination-next'))

      expect(onPageChange).toHaveBeenCalledWith(2)
    })

    it('should call onPageChange with totalPages when clicking last button', async () => {
      const user = userEvent.setup()
      const onPageChange = jest.fn()

      render(<Pagination {...defaultProps} onPageChange={onPageChange} />)

      await user.click(screen.getByTestId('pagination-last'))

      expect(onPageChange).toHaveBeenCalledWith(4)
    })
  })

  describe('Page Size Selection', () => {
    it('should not show page size selector when onPageSizeChange is not provided', () => {
      render(<Pagination {...defaultProps} />)

      expect(screen.queryByTestId('pagination-page-size')).not.toBeInTheDocument()
    })

    it('should show page size selector when onPageSizeChange is provided', () => {
      const onPageSizeChange = jest.fn()

      render(<Pagination {...defaultProps} onPageSizeChange={onPageSizeChange} />)

      expect(screen.getByTestId('pagination-page-size')).toBeInTheDocument()
    })

    it('should call onPageSizeChange with selected value', async () => {
      const user = userEvent.setup()
      const onPageSizeChange = jest.fn()

      render(<Pagination {...defaultProps} onPageSizeChange={onPageSizeChange} />)

      await user.selectOptions(screen.getByTestId('pagination-page-size'), '50')

      expect(onPageSizeChange).toHaveBeenCalledWith(50)
    })

    it('should show custom page size options', () => {
      const onPageSizeChange = jest.fn()

      render(
        <Pagination
          {...defaultProps}
          onPageSizeChange={onPageSizeChange}
          pageSizeOptions={[5, 15, 30]}
        />
      )

      const select = screen.getByTestId('pagination-page-size')
      expect(select).toContainHTML('<option value="5">5</option>')
      expect(select).toContainHTML('<option value="15">15</option>')
      expect(select).toContainHTML('<option value="30">30</option>')
    })
  })

  describe('Accessibility', () => {
    it('should have accessible labels for navigation buttons', () => {
      render(<Pagination {...defaultProps} />)

      expect(screen.getByLabelText('Go to first page')).toBeInTheDocument()
      expect(screen.getByLabelText('Go to previous page')).toBeInTheDocument()
      expect(screen.getByLabelText('Go to next page')).toBeInTheDocument()
      expect(screen.getByLabelText('Go to last page')).toBeInTheDocument()
    })
  })

  describe('Custom className', () => {
    it('should apply custom className', () => {
      render(<Pagination {...defaultProps} className="custom-class" />)

      expect(screen.getByTestId('pagination')).toHaveClass('custom-class')
    })
  })
})
