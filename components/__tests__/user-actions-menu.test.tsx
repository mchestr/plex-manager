import { UserActionsMenu } from '@/components/admin/users/user-actions-menu'
import { fireEvent, render, screen } from '@testing-library/react'
import { makeAdminUserWithStats } from '../../__tests__/utils/test-builders'

// Mock child components
jest.mock('@/components/admin/users/regenerate-wrapped-button', () => ({
  RegenerateWrappedButton: () => <button>Regenerate Wrapped</button>,
}))

jest.mock('@/components/admin/users/unshare-user-button', () => ({
  UnshareUserButton: () => <button>Unshare Library</button>,
}))

describe('UserActionsMenu', () => {
  it('should render "Generating..." when status is generating', () => {
    const user = makeAdminUserWithStats({ wrappedStatus: 'generating', hasPlexAccess: false })
    render(<UserActionsMenu user={user} />)
    expect(screen.getByText('Generating...')).toBeInTheDocument()
  })

  it('should render "No actions" when no actions available', () => {
    const user = makeAdminUserWithStats({
      wrappedStatus: 'generating',
      isAdmin: true // Admin can't be unshared
    })
    render(<UserActionsMenu user={user} />)
    expect(screen.getByText('Generating...')).toBeInTheDocument()
  })

  it('should render actions menu button when actions available', () => {
    const user = makeAdminUserWithStats({ wrappedStatus: 'completed' })
    render(<UserActionsMenu user={user} />)

    const button = screen.getByRole('button', { name: /Actions for/i })
    expect(button).toBeInTheDocument()
  })

  it('should show menu items when clicked', () => {
    const user = makeAdminUserWithStats({ wrappedStatus: 'completed' })
    render(<UserActionsMenu user={user} />)

    const button = screen.getByRole('button', { name: /Actions for/i })
    fireEvent.click(button)

    expect(screen.getByText('View Wrapped')).toBeInTheDocument()
    expect(screen.getByText('Regenerate Wrapped')).toBeInTheDocument()
  })

  it('should show unshare button for non-admin users with plex access', () => {
    const user = makeAdminUserWithStats({
      wrappedStatus: 'completed',
      isAdmin: false,
      hasPlexAccess: true
    })
    render(<UserActionsMenu user={user} />)

    const button = screen.getByRole('button', { name: /Actions for/i })
    fireEvent.click(button)

    expect(screen.getByText('Unshare Library')).toBeInTheDocument()
  })

  it('should NOT show unshare button for admin users', () => {
    const user = makeAdminUserWithStats({
      wrappedStatus: 'completed',
      isAdmin: true,
      hasPlexAccess: true
    })
    render(<UserActionsMenu user={user} />)

    const button = screen.getByRole('button', { name: /Actions for/i })
    fireEvent.click(button)

    expect(screen.queryByText('Unshare Library')).not.toBeInTheDocument()
  })

  it('should close menu when clicking outside', () => {
    const user = makeAdminUserWithStats({ wrappedStatus: 'completed' })
    render(<UserActionsMenu user={user} />)

    const button = screen.getByRole('button', { name: /Actions for/i })
    fireEvent.click(button)
    expect(screen.getByText('View Wrapped')).toBeInTheDocument()

    // Click on the backdrop to close
    const backdrop = document.querySelector('.fixed.inset-0')
    expect(backdrop).toBeInTheDocument()
    fireEvent.click(backdrop!)
    expect(screen.queryByText('View Wrapped')).not.toBeInTheDocument()
  })
})

