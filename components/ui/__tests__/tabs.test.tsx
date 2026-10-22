import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs'

function Example() {
  const [tab, setTab] = useState('chat')
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
      <TabsList aria-label="Model configuration">
        <TabsTab value="chat">Admin assistant</TabsTab>
        <TabsTab value="wrapped">Rewind generation</TabsTab>
        <TabsTab value="extra">Extra</TabsTab>
      </TabsList>
      <TabsPanel value="chat">Chat fields</TabsPanel>
      <TabsPanel value="wrapped">Rewind fields</TabsPanel>
      <TabsPanel value="extra">Extra fields</TabsPanel>
    </Tabs>
  )
}

describe('Tabs', () => {
  it('renders a named tablist with the selected tab and its panel', () => {
    render(<Example />)

    expect(screen.getByRole('tablist', { name: 'Model configuration' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Admin assistant' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Rewind generation' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Chat fields')
  })

  it('moves and selects with the arrow keys, wrapping at the ends', async () => {
    const user = userEvent.setup()
    render(<Example />)

    await user.click(screen.getByRole('tab', { name: 'Admin assistant' }))
    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'Rewind generation' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Rewind generation' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(screen.getByRole('tabpanel')).toHaveTextContent('Rewind fields'))

    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Extra' })).toHaveAttribute('aria-selected', 'true')
  })

  it('selects a tab on click', async () => {
    const user = userEvent.setup()
    render(<Example />)

    await user.click(screen.getByRole('tab', { name: 'Extra' }))

    expect(screen.getByRole('tab', { name: 'Extra' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Admin assistant' })).toHaveAttribute('aria-selected', 'false')
  })
})
