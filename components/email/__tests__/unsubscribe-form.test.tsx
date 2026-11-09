/**
 * The unsubscribe page's question and button: with JavaScript the result of
 * `unsubscribeWithToken` replaces the question with Done or the dead-link
 * screen, and a rate limit shows above the button. Without JavaScript the
 * form posts `List-Unsubscribe=One-Click` to the one-click address.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { unsubscribeWithToken } from '@/actions/email-unsubscribe'
import { UnsubscribeDeadLink, UnsubscribeForm } from '@/components/email/unsubscribe-form'

jest.mock('@/actions/email-unsubscribe', () => ({ unsubscribeWithToken: jest.fn() }))

const SERVER = 'Northfield Plex'
const TOKEN = 'abc.def'

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(unsubscribeWithToken).mockResolvedValue({ success: true, data: null })
})

describe('UnsubscribeForm', () => {
  it('asks first, with no address and no name, and changes nothing', () => {
    render(<UnsubscribeForm token={TOKEN} serverName={SERVER} />)

    expect(screen.getByTestId('unsubscribe-question')).toHaveTextContent('Stop emails about your Northfield Plex access?')
    expect(screen.getByTestId('unsubscribe-submit')).toHaveTextContent('Stop these emails')
    expect(screen.getByTestId('unsubscribe-form')).not.toHaveTextContent('@')
    expect(screen.getByTestId('unsubscribe-account')).toHaveAttribute('href', '/account')
    expect(unsubscribeWithToken).not.toHaveBeenCalled()
  })

  it('is a plain form that posts the one-click field to the one-click address without JavaScript', () => {
    render(<UnsubscribeForm token="a+b.c/d" serverName={SERVER} />)

    const form = screen.getByTestId('unsubscribe-form')
    expect(form).toHaveAttribute('method', 'post')
    expect(form).toHaveAttribute('action', '/api/email/unsubscribe?token=a%2Bb.c%2Fd&source=page')
    expect(screen.getByTestId('unsubscribe-submit')).toHaveAttribute('type', 'submit')
    expect(screen.getByTestId('unsubscribe-submit')).toHaveAttribute('name', 'List-Unsubscribe')
    expect(screen.getByTestId('unsubscribe-submit')).toHaveAttribute('value', 'One-Click')
  })

  it('calls the action with the token and says Done', async () => {
    const user = userEvent.setup()
    render(<UnsubscribeForm token={TOKEN} serverName={SERVER} />)

    await user.click(screen.getByTestId('unsubscribe-submit'))

    expect(await screen.findByTestId('unsubscribe-done')).toHaveTextContent('Done')
    expect(screen.getByText('We will not send you these emails. To turn them on again, sign in to Northfield Plex and open Account.')).toBeInTheDocument()
    expect(unsubscribeWithToken).toHaveBeenCalledWith({ token: TOKEN })
  })

  it('shows the dead-link screen when the token no longer works', async () => {
    jest.mocked(unsubscribeWithToken).mockResolvedValue({ success: false, code: 'NOT_FOUND', error: 'This link no longer works.' })
    const user = userEvent.setup()
    render(<UnsubscribeForm token={TOKEN} serverName={SERVER} />)

    await user.click(screen.getByTestId('unsubscribe-submit'))

    expect(await screen.findByTestId('unsubscribe-dead-link')).toHaveTextContent('This link no longer works')
    expect(screen.queryByTestId('unsubscribe-form')).not.toBeInTheDocument()
  })

  it('keeps the question and shows any other failure above the button', async () => {
    jest.mocked(unsubscribeWithToken).mockResolvedValue({ success: false, code: 'RATE_LIMITED', error: 'Too many attempts. Wait a moment and try again.' })
    const user = userEvent.setup()
    render(<UnsubscribeForm token={TOKEN} serverName={SERVER} />)

    await user.click(screen.getByTestId('unsubscribe-submit'))

    expect(await screen.findByTestId('unsubscribe-error')).toHaveTextContent('Too many attempts')
    expect(screen.getByTestId('unsubscribe-submit')).toBeInTheDocument()
  })
})

describe('UnsubscribeDeadLink', () => {
  it('tells the member to sign in, with a link to the sign-in page', () => {
    render(<UnsubscribeDeadLink serverName={SERVER} />)

    expect(screen.getByText('Sign in to Northfield Plex and open Account to choose your emails.')).toBeInTheDocument()
    expect(screen.getByTestId('unsubscribe-sign-in')).toHaveAttribute('href', '/')
  })
})
