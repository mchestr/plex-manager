import { render, screen } from '@testing-library/react'
import { UsersList } from '../admin/users/users-list'
import { makeAdminUserWithStats } from '@/__tests__/utils/test-builders'

// Mock UserTableRow to simplify test and avoid testing child implementation
jest.mock('../admin/users/user-table-row', () => ({
  UserTableRow: ({ user }: { user: any }) => (
    <tr data-testid="user-row">
      <td>{user.name}</td>
    </tr>
  ),
}))

describe('UsersList', () => {
  it('should render a list of users', () => {
    const users = [
      makeAdminUserWithStats({ id: '1', name: 'User 1' }),
      makeAdminUserWithStats({ id: '2', name: 'User 2' }),
    ]

    render(<UsersList users={users} currentYear={2024} />)

    const rows = screen.getAllByTestId('user-row')
    expect(rows).toHaveLength(2)
    expect(screen.getByText('User 1')).toBeInTheDocument()
    expect(screen.getByText('User 2')).toBeInTheDocument()
  })

  it('should render empty state when no users', () => {
    render(<UsersList users={[]} currentYear={2024} />)

    expect(screen.getByText('No users found')).toBeInTheDocument()
  })
})

