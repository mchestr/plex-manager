import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { LibraryPicker, type LibrarySelection } from '@/components/admin/invites/library-picker'
import type { LibraryListing } from '@/types/invite'

const LISTING: LibraryListing = {
  ok: true,
  libraries: [
    { id: '1', name: 'Movies', type: 'movie' },
    { id: '2', name: 'TV Shows', type: 'show' },
  ],
}

function Harness({ listing = LISTING, onChange }: { listing?: LibraryListing; onChange: (value: LibrarySelection) => void }) {
  const [value, setValue] = useState<LibrarySelection>('all')
  return (
    <LibraryPicker
      listing={listing}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      serverLabel="Plex"
    />
  )
}

describe('LibraryPicker', () => {
  it('starts on All libraries with the list hidden', () => {
    render(<Harness onChange={jest.fn()} />)

    expect(screen.getByRole('group', { name: 'Libraries' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'All libraries' })).toBeChecked()
    expect(screen.queryByRole('checkbox', { name: /Movies/ })).not.toBeInTheDocument()
  })

  it('picks a subset from the keyboard, and All libraries goes back to every library', async () => {
    const onChange = jest.fn()
    render(<Harness onChange={onChange} />)
    const user = userEvent.setup()

    screen.getByRole('checkbox', { name: 'All libraries' }).focus()
    await user.keyboard(' ')
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(screen.getByRole('list', { name: 'Plex libraries' })).toBeInTheDocument()

    await user.tab()
    expect(screen.getByRole('checkbox', { name: /Movies/ })).toHaveFocus()
    await user.keyboard(' ')
    expect(onChange).toHaveBeenLastCalledWith(['1'])
    await user.tab()
    await user.keyboard(' ')
    expect(onChange).toHaveBeenLastCalledWith(['1', '2'])
    await user.keyboard(' ')
    expect(onChange).toHaveBeenLastCalledWith(['1'])

    await user.click(screen.getByRole('checkbox', { name: 'All libraries' }))
    expect(onChange).toHaveBeenLastCalledWith('all')
    expect(screen.queryByRole('list', { name: 'Plex libraries' })).not.toBeInTheDocument()
  })

  it('keeps All libraries and says why when the listing failed', () => {
    render(<Harness listing={{ ok: false, reason: 'No active Plex server configured' }} onChange={jest.fn()} />)

    expect(screen.getByRole('checkbox', { name: 'All libraries' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'All libraries' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('invite-library-error')).toHaveTextContent('No active Plex server configured')
  })
})

describe('LibraryPicker without All libraries', () => {
  it('always lists the libraries, with the prefixed test ids', () => {
    render(<LibraryPicker listing={LISTING} value={['2']} onChange={jest.fn()} serverLabel="Plex" allowAll={false} testIdPrefix="settings-affiliates-library" />)

    expect(screen.queryByRole('checkbox', { name: 'All libraries' })).not.toBeInTheDocument()
    expect(screen.getByTestId('settings-affiliates-library-2')).toBeChecked()
    expect(screen.getByTestId('settings-affiliates-library-1')).not.toBeChecked()
  })

  it('does not offer all libraries when the listing fails', () => {
    render(<LibraryPicker listing={{ ok: false, reason: 'Plex is down.' }} value={[]} onChange={jest.fn()} serverLabel="Plex" allowAll={false} testIdPrefix="settings-affiliates-library" />)

    expect(screen.getByTestId('settings-affiliates-library-error')).toHaveTextContent("Can't list the Plex libraries. Plex is down.")
    expect(screen.getByTestId('settings-affiliates-library-error')).not.toHaveTextContent('all of them')
  })
})
