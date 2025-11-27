import { render, screen } from '@testing-library/react'
import { UnauthorizedError } from '@/components/admin/shared/unauthorized-error'

describe('UnauthorizedError', () => {
  it('should render access denied message', () => {
    render(<UnauthorizedError />)

    expect(screen.getByText('Access Denied')).toBeInTheDocument()
    expect(screen.getByText(/You don't have permission to access this admin page/)).toBeInTheDocument()
  })

  it('should render home navigation link', () => {
    render(<UnauthorizedError />)

    const homeLink = screen.getByText('Go to Home')
    expect(homeLink).toBeInTheDocument()
    expect(homeLink.closest('a')).toHaveAttribute('href', '/')
  })

  it('should not render wrapped button', () => {
    render(<UnauthorizedError />)

    const wrappedLink = screen.queryByText('View Your Wrapped')
    expect(wrappedLink).not.toBeInTheDocument()
  })

  it('should render Rex dinosaur', () => {
    render(<UnauthorizedError />)

    const rexContainer = screen.getByTestId('rex-dinosaur')
    expect(rexContainer).toBeInTheDocument()
  })

  it('should have proper testid attributes', () => {
    render(<UnauthorizedError />)

    expect(screen.getByTestId('unauthorized-error-page')).toBeInTheDocument()
    expect(screen.getByTestId('rex-dinosaur')).toBeInTheDocument()
    expect(screen.getByTestId('access-denied-heading')).toBeInTheDocument()
    expect(screen.getByTestId('go-home-button')).toBeInTheDocument()
  })

  it('should have proper styling classes', () => {
    const { container } = render(<UnauthorizedError />)

    const mainDiv = container.firstChild
    expect(mainDiv).toHaveClass('min-h-screen')
    expect(mainDiv).toHaveClass('bg-gradient-to-b')
  })

  it('should have accessible structure', () => {
    render(<UnauthorizedError />)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Access Denied')
    expect(heading).toHaveAttribute('data-testid', 'access-denied-heading')
  })
})

