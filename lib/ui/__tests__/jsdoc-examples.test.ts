/**
 * The @example blocks in lib/ui/markdown.ts and lib/ui/error-copy.ts.
 */

import { errorCopy } from '../error-copy'
import { safeHref, safeLink } from '../markdown'

const original = process.env.NEXT_PUBLIC_APP_URL

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://plex.example.com'
})
afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = original
})

describe('JSDoc Documentation Examples', () => {
  it('safeLink', () => {
    expect(safeLink('/help')).toEqual({ href: '/help', external: false })
    expect(safeLink('https://example.com/')).toEqual({ href: 'https://example.com/', external: true })
    expect(safeLink('javascript:alert(1)')).toBeNull()
  })

  it('safeHref', () => {
    expect(safeHref('https://requests.example.com')).toBe('https://requests.example.com/')
    expect(safeHref('data:text/html,hi')).toBeNull()
  })

  it('errorCopy', () => {
    expect(errorCopy('TIMEOUT', { audience: 'member' }).description).toBe(
      'Making your Rewind took too long. Please try again in a few minutes.'
    )
    expect(errorCopy("Can't reach database server at db:5432", { audience: 'admin' }).title).toBe(
      'Something went wrong on our side'
    )
  })
})

describe('safeHref', () => {
  it.each([[null], [undefined], [''], ['ftp://example.com'], ['http://[bad']])('refuses %p', (href) => {
    expect(safeHref(href)).toBeNull()
  })
})
