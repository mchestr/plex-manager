import { DiscordCard } from '@/components/dashboard/discord-card'
import { render, screen } from '@testing-library/react'

jest.mock('motion/react', () => {
  const React = jest.requireActual<typeof import('react')>('react')
  const strip = ({ initial: _i, animate: _a, transition: _t, whileHover: _h, whileTap: _p, ...rest }: Record<string, unknown>) => rest
  return {
    motion: {
      a: (props: Record<string, unknown>) => React.createElement('a', strip(props)),
      div: (props: Record<string, unknown>) => React.createElement('div', strip(props)),
    },
  }
})

describe('DiscordCard', () => {
  it('links an unlinked member to /discord/link', () => {
    render(<DiscordCard connection={null} />)

    const link = screen.getByTestId('discord-card-link-action')
    expect(link).toHaveAttribute('href', '/discord/link')
    expect(link).not.toHaveAttribute('target')
  })

  it('shows the linked status without a link action', () => {
    render(<DiscordCard connection={{ username: 'member' }} />)

    expect(screen.getByTestId('discord-card')).toBeInTheDocument()
    expect(screen.queryByTestId('discord-card-link-action')).not.toBeInTheDocument()
  })
})
