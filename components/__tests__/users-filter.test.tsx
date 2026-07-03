import { render, screen, fireEvent } from '@testing-library/react'
import { UsersFilter } from '@/components/admin/users/users-filter'

describe('UsersFilter - subscription control', () => {
  it('renders the subscription dropdown', () => {
    render(<UsersFilter onFilterChange={jest.fn()} />)

    expect(screen.getByText('Subscription')).toBeInTheDocument()
    expect(screen.getByTestId('users-filter-subscription')).toBeInTheDocument()
  })

  it('reports subscription changes with the full filter state', () => {
    const onFilterChange = jest.fn()
    render(<UsersFilter onFilterChange={onFilterChange} />)

    fireEvent.click(screen.getByTestId('users-filter-subscription'))
    fireEvent.click(screen.getByTestId('users-filter-subscription-option-active'))

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        plexAccess: 'yes',
        role: 'all',
        subscription: 'active',
      })
    )
  })

  it('counts an active subscription filter toward the active-filter badge', () => {
    render(<UsersFilter onFilterChange={jest.fn()} />)

    // No active filters initially (defaults: plexAccess=yes, role=all, subscription=all).
    expect(screen.queryByText(/active$/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('users-filter-subscription'))
    fireEvent.click(screen.getByTestId('users-filter-subscription-option-canceled'))

    expect(screen.getByText('1 active')).toBeInTheDocument()
  })

  it('resets the subscription filter back to "all" on clear', () => {
    const onFilterChange = jest.fn()
    render(<UsersFilter onFilterChange={onFilterChange} />)

    fireEvent.click(screen.getByTestId('users-filter-subscription'))
    fireEvent.click(screen.getByTestId('users-filter-subscription-option-past_due'))

    fireEvent.click(screen.getByText('Reset'))

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
