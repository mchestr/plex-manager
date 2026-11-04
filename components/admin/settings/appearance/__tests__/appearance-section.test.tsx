/** Appearance: opens read-only, edits the name, subtitle and accent, and shows a refused colour on its field. */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { updateAppearance } from '@/actions/admin/branding'
import { AppearanceSection } from '@/components/admin/settings/appearance/appearance-section'

jest.mock('@/actions/admin/branding', () => ({ updateAppearance: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const SAVED = { serverName: 'Mikeflix', loginSubtitle: '', accentColor: '#E4202B' }

beforeEach(() => jest.clearAllMocks())

it('opens read-only on the saved values', () => {
  render(<AppearanceSection saved={SAVED} fallbackName="Plex Box" />)
  expect(screen.getByTestId('settings-appearance-summary-server-name')).toHaveTextContent('Mikeflix')
  expect(screen.getByTestId('settings-appearance-summary-login-subtitle')).toHaveTextContent('Not set')
  expect(screen.getByTestId('settings-appearance-summary-accent')).toHaveTextContent('#E4202B')
  expect(screen.queryByTestId('appearance-form')).not.toBeInTheDocument()
})

it('names the fallback when no name or colour is saved', () => {
  render(<AppearanceSection saved={{ serverName: '', loginSubtitle: '', accentColor: '' }} fallbackName="Plex Box" />)
  expect(screen.getByTestId('settings-appearance-summary-server-name')).toHaveTextContent('Not set (using Plex Box)')
  expect(screen.getByTestId('settings-appearance-summary-accent')).toHaveTextContent('Default')
})

it('saves the edited values', async () => {
  const user = userEvent.setup()
  jest.mocked(updateAppearance).mockResolvedValue({ success: true, data: { serverName: 'Mikeflix', loginSubtitle: 'Hi', accentColor: '#E4202B' } })
  render(<AppearanceSection saved={SAVED} fallbackName="Plex Box" />)

  await user.click(screen.getByTestId('settings-appearance-edit'))
  await user.type(screen.getByTestId('appearance-login-subtitle'), 'Hi')
  await user.click(screen.getByTestId('settings-appearance-save'))

  expect(updateAppearance).toHaveBeenCalledWith({ ...SAVED, loginSubtitle: 'Hi' })
  expect(mockShowSuccess).toHaveBeenCalledWith('Appearance saved')
})

it('shows a refused colour on its field and clears it on the next edit', async () => {
  const user = userEvent.setup()
  jest.mocked(updateAppearance).mockResolvedValue({
    success: false,
    code: 'VALIDATION',
    error: 'Enter a colour as #RRGGBB',
    fieldErrors: { accentColor: ['Enter a colour as #RRGGBB'] },
  })
  render(<AppearanceSection saved={SAVED} fallbackName="Plex Box" />)

  await user.click(screen.getByTestId('settings-appearance-edit'))
  const accent = screen.getByTestId('appearance-accent-color')
  await user.clear(accent)
  await user.type(accent, 'red')
  await user.click(screen.getByTestId('settings-appearance-save'))

  expect(await screen.findByTestId('accentColor-error')).toHaveTextContent('Enter a colour as #RRGGBB')
  expect(mockShowError).not.toHaveBeenCalled()
  await user.type(accent, 'x')
  expect(screen.queryByTestId('accentColor-error')).not.toBeInTheDocument()
})

it('toasts a failure that is not about a field', async () => {
  const user = userEvent.setup()
  jest.mocked(updateAppearance).mockResolvedValue({ success: false, code: 'INTERNAL', error: 'Failed to update the appearance' })
  render(<AppearanceSection saved={SAVED} fallbackName="Plex Box" />)

  await user.click(screen.getByTestId('settings-appearance-edit'))
  await user.type(screen.getByTestId('appearance-server-name'), '!')
  await user.click(screen.getByTestId('settings-appearance-save'))
  expect(mockShowError).toHaveBeenCalledWith('Failed to update the appearance')
})
