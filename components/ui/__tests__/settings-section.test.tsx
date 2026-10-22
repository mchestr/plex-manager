import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SettingsDirtyProvider, SettingsSection, type TestResult } from '@/components/ui/settings-section'
import type { SettingsFormState } from '@/hooks/admin/use-settings-form'

function formState(overrides: Partial<SettingsFormState> = {}): SettingsFormState {
  return { isDirty: false, isPending: false, onDiscard: jest.fn(), onSave: jest.fn(), ...overrides }
}

function renderSection(form: SettingsFormState, onTest?: () => Promise<TestResult>) {
  return render(
    <SettingsSection id="tautulli" title="Tautulli" description="Watch history" status="ok" checkedAt={null} form={form} onTest={onTest}>
      <input aria-label="Local URL" />
    </SettingsSection>
  )
}

describe('SettingsSection', () => {
  it('names the section by its heading and shows the connection badge', () => {
    renderSection(formState())

    expect(screen.getByRole('region', { name: 'Tautulli' })).toHaveAttribute('id', 'tautulli')
    expect(screen.getByTestId('settings-tautulli-status')).toHaveTextContent('Connected')
  })

  it('keeps Save disabled until the form is dirty, with no pip or Discard', () => {
    renderSection(formState())

    expect(screen.getByTestId('settings-tautulli-save')).toBeDisabled()
    expect(screen.queryByTestId('settings-tautulli-unsaved')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-tautulli-discard')).not.toBeInTheDocument()
  })

  it('shows the Unsaved changes pip and Discard when dirty, and saves on submit', async () => {
    const user = userEvent.setup()
    const form = formState({ isDirty: true })
    renderSection(form)

    expect(screen.getByTestId('settings-tautulli-unsaved')).toHaveTextContent('Unsaved changes')
    await user.click(screen.getByTestId('settings-tautulli-discard'))
    expect(form.onDiscard).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTestId('settings-tautulli-save'))
    expect(form.onSave).toHaveBeenCalledTimes(1)
  })

  it('renders the test result inline in a status region', async () => {
    const user = userEvent.setup()
    const onTest = jest.fn().mockResolvedValue({ ok: false, message: 'Nothing answered at this address.' })
    renderSection(formState(), onTest)

    await user.click(screen.getByTestId('settings-tautulli-test'))

    expect(await screen.findByRole('status')).toHaveTextContent('Nothing answered at this address.')
  })

  it('renders a failure with its fix as an inline Alert, inside the status region', async () => {
    const user = userEvent.setup()
    const onTest = jest.fn().mockResolvedValue({ ok: false, message: 'Nothing answered at this address', detail: 'Check the host and port.' })
    renderSection(formState(), onTest)

    await user.click(screen.getByTestId('settings-tautulli-test'))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Nothing answered at this address')
    expect(status).toHaveTextContent('Check the host and port.')
    expect(status.querySelector('[data-slot="alert"]')).toHaveAttribute('data-tone', 'warning')
  })

  it('still submits a blocked form, so the server can refuse it too', () => {
    const form = formState({ isDirty: true, blockedReason: 'Enter the API key to test or save' })
    const { container } = renderSection(form)

    container.querySelector('form')?.requestSubmit()

    expect(form.onSave).toHaveBeenCalledTimes(1)
  })

  it('disables Test and Save with blockedReason, and says why', () => {
    renderSection(formState({ isDirty: true, blockedReason: 'Enter the API key to test or save' }), jest.fn())

    expect(screen.getByTestId('settings-tautulli-test')).toBeDisabled()
    expect(screen.getByTestId('settings-tautulli-save')).toBeDisabled()
    expect(screen.getByTestId('settings-tautulli-unsaved')).toHaveTextContent('Enter the API key to test or save')
  })

  it('reports its dirty state to the layout', () => {
    const onDirtyChange = jest.fn()
    const { rerender } = render(
      <SettingsDirtyProvider onDirtyChange={onDirtyChange}>
        <SettingsSection id="plex" title="Plex" description="Server" form={formState()}>
          <span />
        </SettingsSection>
      </SettingsDirtyProvider>
    )
    expect(onDirtyChange).toHaveBeenLastCalledWith('plex', false)

    rerender(
      <SettingsDirtyProvider onDirtyChange={onDirtyChange}>
        <SettingsSection id="plex" title="Plex" description="Server" form={formState({ isDirty: true })}>
          <span />
        </SettingsSection>
      </SettingsDirtyProvider>
    )
    expect(onDirtyChange).toHaveBeenLastCalledWith('plex', true)
  })

  it('reads "Not checked" with its hint before a first check', () => {
    render(
      <SettingsSection id="overseerr" title="Overseerr" description="Requests" status="untested">
        <span />
      </SettingsSection>
    )

    expect(screen.getByTestId('settings-overseerr-status')).toHaveTextContent('Not checked')
    expect(screen.getByTestId('settings-overseerr-status')).toHaveTextContent('Test after saving')
    expect(screen.queryByTestId('settings-overseerr-save')).not.toBeInTheDocument()
  })
})
