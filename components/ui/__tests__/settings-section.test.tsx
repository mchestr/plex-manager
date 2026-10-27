import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { SettingsEditProvider, useSettingsEdit } from '@/components/ui/settings-edit-context'
import { SettingsSection, type TestResult } from '@/components/ui/settings-section'
import type { SettingsFormState } from '@/hooks/admin/use-settings-form'

function formState(overrides: Partial<SettingsFormState> = {}): SettingsFormState {
  return { isDirty: false, isPending: false, onDiscard: jest.fn(), onSave: jest.fn(async () => true), ...overrides }
}

function renderSection(form: SettingsFormState, onTest?: () => Promise<TestResult>, extra: { notSetUp?: boolean } = {}) {
  return render(
    <SettingsSection
      id="tautulli"
      title="Tautulli"
      description="Watch history"
      status="ok"
      checkedAt={null}
      form={form}
      onTest={onTest}
      footerMeta={<p data-testid="meta">Last saved just now by Dana</p>}
      view={<dl data-testid="settings-tautulli-summary" />}
      {...extra}
    >
      <input aria-label="Name" />
      <input aria-label="Local URL" />
    </SettingsSection>
  )
}

/** A section whose form is backed by real state, so dirtiness follows typing. */
function LiveSection({ id = 'tautulli', title = 'Tautulli', save = async () => true }: { id?: string; title?: string; save?: () => Promise<boolean> }) {
  const [name, setName] = useState('Home')
  const form: SettingsFormState = { isDirty: name !== 'Home', isPending: false, onDiscard: () => setName('Home'), onSave: save }
  return (
    <SettingsSection id={id} title={title} description="Watch history" form={form} view={<p>{name}</p>}>
      <input aria-label={`${title} name`} value={name} onChange={(event) => setName(event.target.value)} />
    </SettingsSection>
  )
}

describe('SettingsSection', () => {
  it('names the section by its heading and shows the connection badge', () => {
    renderSection(formState())

    expect(screen.getByRole('region', { name: 'Tautulli' })).toHaveAttribute('id', 'tautulli')
    expect(screen.getByTestId('settings-tautulli-status')).toHaveTextContent('Connected')
  })

  it('opens read-only: the summary, Last saved and an Edit button named for the section, with no form', () => {
    renderSection(formState(), jest.fn())

    expect(screen.getByTestId('settings-tautulli-summary')).toBeInTheDocument()
    expect(screen.getByTestId('meta')).toHaveTextContent('Last saved just now by Dana')
    expect(screen.getByRole('button', { name: 'Edit Tautulli' })).toHaveAttribute('data-testid', 'settings-tautulli-edit')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-tautulli-save')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-tautulli-cancel')).not.toBeInTheDocument()
    // Test connection works on the saved values without editing
    expect(screen.getByRole('button', { name: 'Test connection for Tautulli' })).toBeEnabled()
  })

  it('says "Not set up." with a Set up button when nothing is stored', () => {
    renderSection(formState(), undefined, { notSetUp: true })

    expect(screen.getByTestId('settings-tautulli-empty')).toHaveTextContent('Not set up.')
    expect(screen.getByRole('button', { name: 'Set up Tautulli' })).toHaveAttribute('data-testid', 'settings-tautulli-edit')
    expect(screen.queryByTestId('settings-tautulli-summary')).not.toBeInTheDocument()
  })

  it('swaps the summary for a named form in place, marks the mode, and focuses the first field', async () => {
    const user = userEvent.setup()
    renderSection(formState())

    await user.click(screen.getByTestId('settings-tautulli-edit'))

    expect(screen.getByRole('form', { name: 'Tautulli' })).toHaveAttribute('id', 'settings-tautulli-form')
    expect(screen.queryByTestId('settings-tautulli-summary')).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-tautulli-editing')).toHaveTextContent('Editing')
    expect(screen.queryByTestId('settings-tautulli-edit')).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-tautulli-section').querySelector('[data-slot="card"]')).toHaveAttribute('data-editing')
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Save changes to Tautulli' })).toHaveAttribute('form', 'settings-tautulli-form')
    expect(screen.getByRole('button', { name: 'Cancel editing Tautulli' })).toBeInTheDocument()
  })

  it('focuses a field marked data-settings-autofocus over the first one', async () => {
    const user = userEvent.setup()
    render(
      <SettingsSection id="plex" title="Plex" description="Server" form={formState()} view={<p>saved</p>}>
        <input aria-label="Name" />
        <input aria-label="Token" data-settings-autofocus />
      </SettingsSection>
    )

    await user.click(screen.getByTestId('settings-plex-edit'))

    expect(screen.getByRole('textbox', { name: 'Token' })).toHaveFocus()
  })

  it('keeps Save enabled with nothing changed; saving then just closes, without a server call, and focus returns to Edit', async () => {
    const user = userEvent.setup()
    const form = formState()
    renderSection(form)

    await user.click(screen.getByTestId('settings-tautulli-edit'))
    expect(screen.getByTestId('settings-tautulli-save')).toBeEnabled()
    expect(screen.queryByTestId('settings-tautulli-unsaved')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('settings-tautulli-save'))

    expect(form.onSave).not.toHaveBeenCalled()
    expect(screen.getByTestId('settings-tautulli-summary')).toBeInTheDocument()
    expect(screen.getByTestId('settings-tautulli-edit')).toHaveFocus()
  })

  it('a successful save returns to the summary with focus on Edit', async () => {
    const user = userEvent.setup()
    const save = jest.fn(async () => true)
    render(<LiveSection save={save} />)

    await user.click(screen.getByTestId('settings-tautulli-edit'))
    await user.type(screen.getByRole('textbox', { name: 'Tautulli name' }), ' server')
    expect(screen.getByTestId('settings-tautulli-unsaved')).toHaveTextContent('Unsaved changes')
    await user.click(screen.getByTestId('settings-tautulli-save'))

    expect(save).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByTestId('settings-tautulli-edit')).toHaveFocus())
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('a failed save stays open and focuses the first invalid field', async () => {
    const user = userEvent.setup()
    render(
      <SettingsSection id="tautulli" title="Tautulli" description="Watch history" form={formState({ isDirty: true, onSave: jest.fn(async () => false) })}>
        <input aria-label="Name" />
        <input aria-label="Local URL" aria-invalid="true" />
      </SettingsSection>
    )

    await user.click(screen.getByTestId('settings-tautulli-save'))

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Local URL' })).toHaveFocus())
    expect(screen.getByRole('form', { name: 'Tautulli' })).toBeInTheDocument()
  })

  it('Cancel on a clean form closes at once, with focus on Edit', async () => {
    const user = userEvent.setup()
    const form = formState()
    renderSection(form)

    await user.click(screen.getByTestId('settings-tautulli-edit'))
    await user.click(screen.getByTestId('settings-tautulli-cancel'))

    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-tautulli-edit')).toHaveFocus()
    expect(screen.queryByTestId('settings-tautulli-discard-dialog')).not.toBeInTheDocument()
  })

  it('Cancel on a dirty form asks first: Keep editing stays, Discard changes discards and closes', async () => {
    const user = userEvent.setup()
    render(<LiveSection />)

    await user.click(screen.getByTestId('settings-tautulli-edit'))
    await user.type(screen.getByRole('textbox', { name: 'Tautulli name' }), 'x')
    await user.click(screen.getByTestId('settings-tautulli-cancel'))

    const dialog = await screen.findByTestId('settings-tautulli-discard-dialog')
    expect(dialog).toHaveTextContent('Discard changes to Tautulli?')
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByTestId('settings-tautulli-discard-dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: 'Tautulli name' })).toHaveValue('Homex')

    await user.click(screen.getByTestId('settings-tautulli-cancel'))
    await user.click(await screen.findByTestId('settings-tautulli-discard-dialog-confirm'))

    await waitFor(() => expect(screen.queryByRole('form')).not.toBeInTheDocument())
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.queryByTestId('settings-tautulli-unsaved')).not.toBeInTheDocument()
  })

  it('Escape works like Cancel, and is ignored when already handled or from outside the form', async () => {
    const user = userEvent.setup()
    render(<LiveSection />)

    await user.click(screen.getByTestId('settings-tautulli-edit'))
    const field = screen.getByRole('textbox', { name: 'Tautulli name' })

    // Something inside (a popup) already took this Escape
    field.addEventListener('keydown', (event) => event.preventDefault(), { once: true })
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(screen.getByRole('form')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-tautulli-edit')).toHaveFocus()

    await user.click(screen.getByTestId('settings-tautulli-edit'))
    await user.type(screen.getByRole('textbox', { name: 'Tautulli name' }), 'x')
    await user.keyboard('{Escape}')
    expect(await screen.findByTestId('settings-tautulli-discard-dialog')).toBeInTheDocument()
  })

  it('a dirty form stays open and shows the pip and the reason, and still submits when blocked so the server can refuse it too', () => {
    const form = formState({ isDirty: true, blockedReason: 'Enter the API key to test or save' })
    renderSection(form, jest.fn())

    expect(screen.getByRole('form', { name: 'Tautulli' })).toBeInTheDocument()
    expect(screen.getByTestId('settings-tautulli-unsaved')).toHaveTextContent('Unsaved changes')
    expect(screen.getByTestId('settings-tautulli-unsaved')).toHaveTextContent('Enter the API key to test or save')
    expect(screen.getByTestId('settings-tautulli-test')).toBeDisabled()
    expect(screen.getByTestId('settings-tautulli-save')).toBeDisabled()

    screen.getByRole<HTMLFormElement>('form').requestSubmit()

    expect(form.onSave).toHaveBeenCalledTimes(1)
  })

  it('in view mode a blocked section disables Test and gives the reason in place of Last saved', () => {
    renderSection(formState({ blockedReason: 'Enter the API key to test or save' }), jest.fn())

    expect(screen.getByTestId('settings-tautulli-test')).toBeDisabled()
    expect(screen.getByTestId('settings-tautulli-blocked')).toHaveTextContent('Enter the API key to test or save')
    expect(screen.queryByTestId('meta')).not.toBeInTheDocument()
  })

  it('renders the test result inline in a status region, kept when the section switches to edit mode', async () => {
    const user = userEvent.setup()
    const onTest = jest.fn().mockResolvedValue({ ok: false, message: 'Nothing answered at this address.' })
    renderSection(formState(), onTest)

    await user.click(screen.getByTestId('settings-tautulli-test'))
    expect(await screen.findByRole('status')).toHaveTextContent('Nothing answered at this address.')

    await user.click(screen.getByTestId('settings-tautulli-edit'))
    expect(screen.getByRole('status')).toHaveTextContent('Nothing answered at this address.')
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

  it('reports its dirty state to the page', () => {
    const onDirtyChange = jest.fn()
    const { rerender } = render(
      <SettingsEditProvider onDirtyChange={onDirtyChange}>
        <SettingsSection id="plex" title="Plex" description="Server" form={formState()}>
          <span />
        </SettingsSection>
      </SettingsEditProvider>
    )
    expect(onDirtyChange).toHaveBeenLastCalledWith('plex', false)

    rerender(
      <SettingsEditProvider onDirtyChange={onDirtyChange}>
        <SettingsSection id="plex" title="Plex" description="Server" form={formState({ isDirty: true })}>
          <span />
        </SettingsSection>
      </SettingsEditProvider>
    )
    expect(onDirtyChange).toHaveBeenLastCalledWith('plex', true)
  })

  it('opens one section at a time on the page, but never closes one with unsaved changes', async () => {
    const user = userEvent.setup()
    render(
      <SettingsEditProvider onDirtyChange={jest.fn()}>
        <LiveSection id="plex" title="Plex" />
        <LiveSection id="tautulli" title="Tautulli" />
        <LiveSection id="overseerr" title="Overseerr" />
      </SettingsEditProvider>
    )

    await user.click(screen.getByTestId('settings-plex-edit'))
    await user.click(screen.getByTestId('settings-tautulli-edit'))
    expect(screen.queryByRole('form', { name: 'Plex' })).not.toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Tautulli' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Tautulli name' })).toHaveFocus()

    await user.type(screen.getByRole('textbox', { name: 'Tautulli name' }), 'x')
    await user.click(screen.getByTestId('settings-overseerr-edit'))
    expect(screen.getByRole('form', { name: 'Tautulli' })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Overseerr' })).toBeInTheDocument()
  })

  it('opens from elsewhere on the page and focuses the requested control', async () => {
    const user = userEvent.setup()
    function Link() {
      const requestEdit = useSettingsEdit()
      return (
        <a href="#zone" onClick={() => requestEdit?.('system', { focus: '[aria-label="Zone"]' })}>
          Change the server time zone
        </a>
      )
    }
    render(
      <SettingsEditProvider onDirtyChange={jest.fn()}>
        <Link />
        <SettingsSection id="system" title="System information" description="Runtime" form={formState()} view={<p>UTC</p>}>
          <input aria-label="Other" />
          <input aria-label="Zone" />
        </SettingsSection>
      </SettingsEditProvider>
    )

    await user.click(screen.getByRole('link', { name: 'Change the server time zone' }))

    expect(screen.getByRole('textbox', { name: 'Zone' })).toHaveFocus()
  })

  it('has no Edit, form or footer without a form (Privacy, Security), and reads "Not checked" with its hint', () => {
    render(
      <SettingsSection id="overseerr" title="Overseerr" description="Requests" status="untested">
        <span>content</span>
      </SettingsSection>
    )

    expect(screen.getByText('content')).toBeInTheDocument()
    expect(screen.getByTestId('settings-overseerr-status')).toHaveTextContent('Not checked')
    expect(screen.getByTestId('settings-overseerr-status')).toHaveTextContent('Test after saving')
    expect(screen.queryByTestId('settings-overseerr-edit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-overseerr-save')).not.toBeInTheDocument()
  })

  it('ignores Cancel and Escape while a save is pending', async () => {
    const form = formState({ isDirty: true, isPending: true })
    renderSection(form)

    expect(screen.getByTestId('settings-tautulli-cancel')).toBeDisabled()
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'Escape' })
    })
    expect(screen.queryByTestId('settings-tautulli-discard-dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('form')).toBeInTheDocument()
  })
})
