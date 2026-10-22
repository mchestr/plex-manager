/**
 * The Appearance picker (P10.10): hidden while the light-theme flag is off,
 * a named radio group on /account and `menuitemradio`s in the account menu,
 * driven by the keyboard, saving through setAppearance then refreshing.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'

import { setAppearance } from '@/actions/appearance'
import { AppearancePicker } from '@/components/account/appearance-picker'
import { AccountMenu } from '@/components/shell/account-menu'
import { AppearanceProvider, type Appearance } from '@/lib/appearance-context'
import type { ShellUser } from '@/lib/member/shell'

expect.extend(toHaveNoViolations)

jest.mock('@/actions/appearance', () => ({ setAppearance: jest.fn() }))
jest.mock('next-auth/react', () => ({ signOut: jest.fn() }))
const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: mockRefresh }) }))
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showError: mockShowError }) }))

const ON: Appearance = { enabled: true, theme: 'dark' }
const member: ShellUser = { name: 'Theo Marsh', email: 'theo@example.com', initials: 'TM', isAdmin: false, membership: false }

function renderWith(appearance: Appearance, ui: React.ReactNode) {
  return render(<AppearanceProvider value={appearance}>{ui}</AppearanceProvider>)
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(setAppearance).mockImplementation(async (theme) => ({ success: true, data: { theme } }))
})

describe('AppearancePicker', () => {
  it('renders nothing while the flag is off', () => {
    const { container } = renderWith({ enabled: false, theme: 'dark' }, <AppearancePicker />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing without a provider', () => {
    const { container } = render(<AppearancePicker />)

    expect(container).toBeEmptyDOMElement()
  })

  it('is a named radio group with Dark checked, and no axe violations', async () => {
    const { container } = renderWith(ON, <AppearancePicker />)

    const group = screen.getByRole('radiogroup', { name: 'Theme' })
    expect(within(group).getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(within(group).getByRole('radio', { name: 'Light' })).not.toBeChecked()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('moves to Light with the arrow keys, saves it and refreshes', async () => {
    const user = userEvent.setup()
    renderWith(ON, <AppearancePicker />)

    await user.tab()
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')

    await waitFor(() => expect(setAppearance).toHaveBeenCalledWith('light'))
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked()
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
  })

  it('reverts and shows the error when the save is refused', async () => {
    const user = userEvent.setup()
    jest.mocked(setAppearance).mockResolvedValue({
      success: false,
      code: 'FORBIDDEN',
      error: 'The light theme is not available',
    })
    renderWith(ON, <AppearancePicker />)

    await user.click(screen.getByRole('radio', { name: 'Light' }))

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('The light theme is not available'))
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('starts from the resolved theme', () => {
    renderWith({ enabled: true, theme: 'light' }, <AppearancePicker />)

    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked()
  })
})

describe('AccountMenu Appearance', () => {
  it('is absent while the flag is off', async () => {
    const user = userEvent.setup()
    renderWith({ enabled: false, theme: 'dark' }, <AccountMenu user={member} />)

    await user.click(screen.getByTestId('account-menu-trigger'))
    const menu = await screen.findByRole('menu')

    expect(within(menu).queryByRole('menuitemradio')).not.toBeInTheDocument()
  })

  it('offers Dark and Light as menu radios and saves the choice from the keyboard', async () => {
    const user = userEvent.setup()
    renderWith(ON, <AccountMenu user={member} />)

    await user.click(screen.getByTestId('account-menu-trigger'))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('group', { name: 'Appearance' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')

    within(menu).getByRole('menuitemradio', { name: 'Light' }).focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(setAppearance).toHaveBeenCalledWith('light'))
    expect(within(menu).getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true')
  })
})
