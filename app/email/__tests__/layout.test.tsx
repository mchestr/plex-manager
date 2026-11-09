/**
 * The pages an email links to sit in the public shell, with the server name,
 * and show without JavaScript even when the page streams.
 */

import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import EmailLayout from '@/app/email/layout'
import { serverName } from '@/lib/brand'
import { NO_SCRIPT_STREAM } from '@/lib/ui/no-script-stream'

jest.mock('@/lib/brand', () => ({ serverName: jest.fn() }))
jest.mock('@/components/shell/public-shell', () => ({
  PublicShell: ({ serverName, children }: { serverName: string; children: ReactNode }) => (
    <div data-testid="public-shell" data-server={serverName}>
      {children}
    </div>
  ),
}))

it('wraps the page in the public shell with the server name', async () => {
  jest.mocked(serverName).mockResolvedValue('Northfield Plex')

  render(await EmailLayout({ children: <p>page</p> }))

  expect(screen.getByTestId('public-shell')).toHaveAttribute('data-server', 'Northfield Plex')
  expect(screen.getByText('page')).toBeInTheDocument()
})

it('shows a streamed page without JavaScript too', async () => {
  jest.mocked(serverName).mockResolvedValue('Northfield Plex')

  const html = renderToStaticMarkup(await EmailLayout({ children: <p>page</p> }))

  expect(html).toContain(`<noscript><style>${NO_SCRIPT_STREAM}</style></noscript>`)
})
