import { render, screen } from '@testing-library/react'
import { TopUsersWidget } from '../top-users-widget'
import type { TopUser } from '@/actions/admin'

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>
  }
})

describe('TopUsersWidget', () => {
  const mockUsers: TopUser[] = [
    {
      userId: 'user-1',
      name: 'John Doe',
      email: 'john@example.com',
      image: 'https://example.com/john.jpg',
      requests: 150,
      cost: 3.50,
      tokens: 15000,
    },
    {
      userId: 'user-2',
      name: 'Jane Smith',
      email: 'jane@example.com',
      image: null,
      requests: 100,
      cost: 2.25,
      tokens: 10000,
    },
    {
      userId: 'user-3',
      name: 'Bob Wilson',
      email: 'bob@example.com',
      image: 'https://example.com/bob.jpg',
      requests: 75,
      cost: 1.80,
      tokens: 7500,
    },
  ]

  describe('Rendering', () => {
    it('should render the top users widget', () => {
      render(<TopUsersWidget users={mockUsers} />)

      expect(screen.getByTestId('top-users-widget')).toBeInTheDocument()
    })

    it('should display all user rows', () => {
      render(<TopUsersWidget users={mockUsers} />)

      expect(screen.getByTestId('top-user-row-user-1')).toBeInTheDocument()
      expect(screen.getByTestId('top-user-row-user-2')).toBeInTheDocument()
      expect(screen.getByTestId('top-user-row-user-3')).toBeInTheDocument()
    })

    it('should display user names', () => {
      render(<TopUsersWidget users={mockUsers} />)

      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('Jane Smith')).toBeInTheDocument()
      expect(screen.getByText('Bob Wilson')).toBeInTheDocument()
    })

    it('should display user emails', () => {
      render(<TopUsersWidget users={mockUsers} />)

      expect(screen.getByText('john@example.com')).toBeInTheDocument()
      expect(screen.getByText('jane@example.com')).toBeInTheDocument()
      expect(screen.getByText('bob@example.com')).toBeInTheDocument()
    })

    it('should display table headers', () => {
      render(<TopUsersWidget users={mockUsers} />)

      expect(screen.getByText('User')).toBeInTheDocument()
      expect(screen.getByText('Requests')).toBeInTheDocument()
      expect(screen.getByText('Cost')).toBeInTheDocument()
    })

    it('should display request counts', () => {
      render(<TopUsersWidget users={mockUsers} />)

      expect(screen.getByText('150')).toBeInTheDocument()
      expect(screen.getByText('100')).toBeInTheDocument()
      expect(screen.getByText('75')).toBeInTheDocument()
    })

    it('should display costs formatted with 4 decimal places', () => {
      render(<TopUsersWidget users={mockUsers} />)

      expect(screen.getByText('$3.5000')).toBeInTheDocument()
      expect(screen.getByText('$2.2500')).toBeInTheDocument()
      expect(screen.getByText('$1.8000')).toBeInTheDocument()
    })

    it('should display rank numbers', () => {
      render(<TopUsersWidget users={mockUsers} />)

      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('should show "No user activity data available" when users array is empty', () => {
      render(<TopUsersWidget users={[]} />)

      expect(screen.getByText('No user activity data available')).toBeInTheDocument()
      expect(screen.queryByTestId('top-users-widget')).not.toBeInTheDocument()
    })
  })

  describe('User Images', () => {
    it('should display user images when available', () => {
      const { container } = render(<TopUsersWidget users={mockUsers} />)

      // Two users have images (John and Bob)
      const images = container.querySelectorAll('img') as NodeListOf<HTMLImageElement>
      expect(images).toHaveLength(2)

      const imageSrcs = Array.from(images).map(img => img.src)
      expect(imageSrcs).toContain('https://example.com/john.jpg')
      expect(imageSrcs).toContain('https://example.com/bob.jpg')
    })

    it('should display initials fallback when image is null', () => {
      const usersWithNoImage: TopUser[] = [{
        userId: 'user-1',
        name: 'Jane Smith',
        email: 'jane@example.com',
        image: null,
        requests: 100,
        cost: 2.25,
        tokens: 10000,
      }]

      render(<TopUsersWidget users={usersWithNoImage} />)

      // Should show first letter of name as fallback
      expect(screen.getByText('J')).toBeInTheDocument()
    })

    it('should use email initial when name is empty', () => {
      const userWithNoName: TopUser[] = [{
        userId: 'user-1',
        name: '',
        email: 'test@example.com',
        image: null,
        requests: 100,
        cost: 2.25,
        tokens: 10000,
      }]

      render(<TopUsersWidget users={userWithNoName} />)

      // Should show first letter of email as fallback
      expect(screen.getByText('T')).toBeInTheDocument()
    })
  })

  describe('Links', () => {
    it('should link user rows to user detail page', () => {
      render(<TopUsersWidget users={mockUsers} />)

      const userLinks = screen.getAllByRole('link')
      // First 3 links are user links, last one is "View all LLM usage"
      expect(userLinks[0]).toHaveAttribute('href', '/admin/users/user-1')
      expect(userLinks[1]).toHaveAttribute('href', '/admin/users/user-2')
      expect(userLinks[2]).toHaveAttribute('href', '/admin/users/user-3')
    })

    it('should display "View all LLM usage" link', () => {
      render(<TopUsersWidget users={mockUsers} />)

      const viewAllLink = screen.getByText('View all LLM usage →')
      expect(viewAllLink).toBeInTheDocument()
      expect(viewAllLink.closest('a')).toHaveAttribute('href', '/admin/llm-usage')
    })
  })

  describe('Edge Cases', () => {
    it('should handle user with Unknown name', () => {
      const userWithUnknownName: TopUser[] = [{
        userId: 'user-1',
        name: 'Unknown',
        email: '',
        image: null,
        requests: 50,
        cost: 1.00,
        tokens: 5000,
      }]

      render(<TopUsersWidget users={userWithUnknownName} />)

      expect(screen.getByText('Unknown')).toBeInTheDocument()
    })

    it('should handle zero values', () => {
      const userWithZeros: TopUser[] = [{
        userId: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        image: null,
        requests: 0,
        cost: 0,
        tokens: 0,
      }]

      render(<TopUsersWidget users={userWithZeros} />)

      expect(screen.getByText('0')).toBeInTheDocument()
      expect(screen.getByText('$0.0000')).toBeInTheDocument()
    })

    it('should handle large request counts', () => {
      const userWithLargeNumbers: TopUser[] = [{
        userId: 'user-1',
        name: 'Power User',
        email: 'power@example.com',
        image: null,
        requests: 1000000,
        cost: 9999.9999,
        tokens: 50000000,
      }]

      render(<TopUsersWidget users={userWithLargeNumbers} />)

      expect(screen.getByText('1,000,000')).toBeInTheDocument()
      expect(screen.getByText('$9999.9999')).toBeInTheDocument()
    })
  })
})
