/** The Wordmark: the pip and name, or the uploaded wordmark with the name as its alt text. */

import { render, screen } from '@testing-library/react'

import { Wordmark } from '@/components/ui/wordmark'
import { BrandAssetsProvider } from '@/lib/branding-context'

it('draws the pip and the name without an uploaded wordmark', () => {
  render(<Wordmark serverName="Northfield Plex" />)
  expect(screen.getByText('Northfield Plex')).toBeInTheDocument()
  expect(screen.queryByTestId('brand-wordmark')).not.toBeInTheDocument()
})

it('draws the uploaded wordmark, named for screen readers', () => {
  render(
    <BrandAssetsProvider value={{ wordmark: '/api/branding/wordmark?v=abc' }}>
      <Wordmark serverName="Mikeflix" size="sm" />
    </BrandAssetsProvider>
  )
  const image = screen.getByRole('img', { name: 'Mikeflix' })
  expect(image).toHaveAttribute('src', '/api/branding/wordmark?v=abc')
  expect(image).toHaveClass('h-5')
})
