import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UsersFilter } from '@/components/admin/users/users-filter'

async function choose(testId: string, value: string) {
  const user = userEvent.setup()
  await user.click(screen.getByTestId(testId))
  await user.click(await screen.findByTestId(`${testId}-option-${value}`))
  return user
}

describe('UsersFilter - subscription control', () => {
  it('renders the subscription dropdown', () => {
    render(<UsersFilter onFilterChange={jest.fn()} />)

    expect(screen.getByText('Subscription')).toBeInTheDocument()
    expect(screen.getByTestId('users-filter-subscription')).toBeInTheDocument()
  })

  it('reports subscription changes with the full filter state', async () => {
    const onFilterChange = jest.fn()
    render(<UsersFilter onFilterChange={onFilterChange} />)

    await choose('users-filter-subscription', 'active')

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        plexAccess: 'yes',
        role: 'all',
        subscription: 'active',
      })
    )
  })

  it('counts an active subscription filter toward the active-filter badge', async () => {
    render(<UsersFilter onFilterChange={jest.fn()} />)

    // No active filters initially (defaults: plexAccess=yes, role=all, subscription=all).
    expect(screen.queryByText(/active$/)).not.toBeInTheDocument()

    await choose('users-filter-subscription', 'canceled')

    expect(screen.getByText('1 active')).toBeInTheDocument()
  })

  it('resets the subscription filter back to "all" on clear', async () => {
    const onFilterChange = jest.fn()
    render(<UsersFilter onFilterChange={onFilterChange} />)

    const user = await choose('users-filter-subscription', 'past_due')

    await user.click(screen.getByText('Reset'))

    expect(onFilterChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        plexAccess: 'yes',
        role: 'all',
        subscription: 'all',
      })
    )
  })

  it('honors a provided default subscription filter', () => {
    render(
      <UsersFilter
        onFilterChange={jest.fn()}
        defaultFilter={{ subscription: 'canceled' }}
      />
    )

    // The trigger button shows the selected option's label.
    expect(screen.getByTestId('users-filter-subscription')).toHaveTextContent('Canceled')
  })
})
