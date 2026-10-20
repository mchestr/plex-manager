import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UsersList } from '../admin/users/users-list'
import {
  makeAdminUserWithStats,
  makeAdminUserWithSubscription,
} from '@/__tests__/utils/test-builders'

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

  it('should render a Subscription column header', () => {
    render(<UsersList users={[]} currentYear={2024} />)

    // "Subscription" also appears as the filter dropdown label, so scope the
    // assertion to the table header specifically.
    expect(
      screen.getByRole('columnheader', { name: 'Subscription' })
    ).toBeInTheDocument()
  })

  describe('subscription filter', () => {
    const activeUser = makeAdminUserWithSubscription({
      id: '1',
      name: 'Active User',
      subscriptionStatus: 'ACTIVE',
    })
    const canceledUser = makeAdminUserWithSubscription({
      id: '2',
      name: 'Canceled User',
      subscriptionStatus: 'CANCELED',
    })
    const noneUser = makeAdminUserWithSubscription({
      id: '3',
      name: 'None User',
      subscriptionStatus: null,
    })

    const selectSubscription = async (value: string) => {
      // Open the Select, then choose the option from its portalled list.
      const user = userEvent.setup()
      await user.click(screen.getByTestId('users-filter-subscription'))
      await user.click(await screen.findByTestId(`users-filter-subscription-option-${value}`))
    }

    it('shows all users when the subscription filter is "all"', () => {
      render(<UsersList users={[activeUser, canceledUser, noneUser]} currentYear={2024} />)

      expect(screen.getAllByTestId('user-row')).toHaveLength(3)
    })

    it('narrows the list to active subscriptions', async () => {
      render(<UsersList users={[activeUser, canceledUser, noneUser]} currentYear={2024} />)

      await selectSubscription('active')

      expect(screen.getAllByTestId('user-row')).toHaveLength(1)
      expect(screen.getByText('Active User')).toBeInTheDocument()
      expect(screen.queryByText('Canceled User')).not.toBeInTheDocument()
      expect(screen.queryByText('None User')).not.toBeInTheDocument()
    })

    it('narrows the list to users without a subscription', async () => {
      render(<UsersList users={[activeUser, canceledUser, noneUser]} currentYear={2024} />)

      await selectSubscription('none')

      expect(screen.getAllByTestId('user-row')).toHaveLength(1)
      expect(screen.getByText('None User')).toBeInTheDocument()
    })

    it('narrows the list to canceled subscriptions', async () => {
      render(<UsersList users={[activeUser, canceledUser, noneUser]} currentYear={2024} />)

      await selectSubscription('canceled')

      expect(screen.getAllByTestId('user-row')).toHaveLength(1)
      expect(screen.getByText('Canceled User')).toBeInTheDocument()
    })
  })
})

