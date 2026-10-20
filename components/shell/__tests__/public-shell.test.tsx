import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { signOut } from 'next-auth/react'

import { PublicShell } from '@/components/shell/public-shell'

expect.extend(toHaveNoViolations)

jest.mock('next-auth/react', () => ({ signOut: jest.fn().mockResolvedValue(undefined) }))

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: jest.fn() }) }))

describe('PublicShell', () => {
  it('renders the Wordmark and one main, with no Sign out when signed out', async () => {
    const { container } = render(
      <PublicShell serverName="Northfield Plex">
        <h1>Sign in</h1>
      </PublicShell>
    )

    expect(screen.getByText('Northfield Plex')).toBeInTheDocument()
    expect(container.querySelectorAll('main#main')).toHaveLength(1)
    expect(screen.queryByTestId('public-shell-sign-out')).not.toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows the name and a Sign out that lands on / with account', async () => {
    const user = userEvent.setup()
    render(
      <PublicShell serverName="Northfield Plex" width="wide" account={{ name: 'Theo Marsh' }}>
        <h1>Join Northfield Plex</h1>
      </PublicShell>
    )

    expect(screen.getByTestId('public-shell-account')).toHaveTextContent('Theo Marsh')
    await user.click(screen.getByTestId('public-shell-sign-out'))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
    expect(signOut).toHaveBeenCalledWith({ redirect: false })
  })

  it('condenses a long server name and keeps it whole in title', () => {
    const name = 'The Extremely Long Family Media Server'
    render(
      <PublicShell serverName={name}>
        <p>Body</p>
      </PublicShell>
    )

    const wordmark = screen.getByText(name)
    expect(wordmark).toHaveAttribute('title', name)
    expect(wordmark).toHaveClass('font-stretch-85%', 'truncate')
  })
})
