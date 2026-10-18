import { render, screen } from '@testing-library/react'

import { JellyfinLoginToggle } from '@/components/admin/settings/JellyfinLoginToggle'

jest.mock('@/actions/admin/admin-servers', () => ({
  toggleJellyfinLogin: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}))

jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }),
}))

describe('JellyfinLoginToggle', () => {
  it('names the setting it turns off', () => {
    render(<JellyfinLoginToggle enabledForLogin={true} />)

    expect(screen.getByRole('button', { name: 'Turn off Jellyfin sign-in' })).toHaveTextContent('Turn off')
  })

  it('names the setting it turns on', () => {
    render(<JellyfinLoginToggle enabledForLogin={false} />)

    expect(screen.getByRole('button', { name: 'Turn on Jellyfin sign-in' })).toHaveTextContent('Turn on')
  })
})
