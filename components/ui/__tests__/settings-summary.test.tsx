import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { NotSet, SecretSummary, SettingsSummary, SettingsSummaryRow } from '@/components/ui/settings-summary'

describe('SettingsSummary', () => {
  it('is a description list of label and value pairs', () => {
    render(
      <SettingsSummary data-testid="summary">
        <SettingsSummaryRow label="Local URL" mono data-testid="row-url">
          http://localhost:8181
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Public URL" wide>
          <NotSet />
        </SettingsSummaryRow>
      </SettingsSummary>
    )

    const list = screen.getByTestId('summary')
    expect(list.tagName).toBe('DL')
    expect(screen.getByText('Local URL').tagName).toBe('DT')
    expect(screen.getByText('http://localhost:8181').tagName).toBe('DD')
    expect(screen.getByText('http://localhost:8181')).toHaveClass('font-mono')
    expect(screen.getByTestId('row-url').parentElement).toBe(list)
    expect(screen.getByText('Not set')).toHaveClass('text-muted-foreground')
  })
})

describe('SecretSummary', () => {
  it('shows a saved secret by its last four only', () => {
    render(<SecretSummary saved={{ last4: 'a91c', origin: 'http://localhost:5055' }} noun="API key" />)

    expect(screen.getByText(/Saved, ends in/)).toHaveTextContent('Saved, ends in a91c')
  })

  it('says "Saved" when the secret is too short to show any of it', () => {
    render(<SecretSummary saved={{ last4: '', origin: null }} noun="API key" />)

    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('reads "Not set", or what an unset secret falls back to', () => {
    const { rerender } = render(<SecretSummary saved={null} noun="token" />)
    expect(screen.getByText('Not set')).toBeInTheDocument()

    rerender(<SecretSummary saved={null} noun="token" empty="Not set, uses DISCORD_BOT_TOKEN if set" />)
    expect(screen.getByText('Not set, uses DISCORD_BOT_TOKEN if set')).toBeInTheDocument()
  })

  it('says an unreadable secret cannot be read, and offers to enter it again', async () => {
    const user = userEvent.setup()
    const onReenter = jest.fn()
    render(<SecretSummary saved={{ last4: '', origin: null, unreadable: true }} noun="API key" onReenter={onReenter} reenterTestId="reenter" />)

    expect(screen.getByText(/Can't be read with the current encryption key/)).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Enter it again (API key)' }))
    expect(onReenter).toHaveBeenCalledTimes(1)
  })
})
