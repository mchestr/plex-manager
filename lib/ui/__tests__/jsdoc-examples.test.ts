/**
 * The @example blocks in lib/ui/markdown.ts, lib/ui/error-copy.ts,
 * lib/ui/status.ts and lib/ui/poster-palette.ts.
 */

import { errorCopy } from '../error-copy'
import { safeHref, safeLink } from '../markdown'
import { posterPalette } from '../poster-palette'
import { resolveStatus, settingsCategory } from '../status'

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

  it('resolveStatus and settingsCategory', () => {
    expect(resolveStatus('subscription', 'ACTIVE', { date: new Date('2026-11-06T12:00:00Z') })).toEqual({
      label: 'Active',
      tone: 'success',
      mark: 'dot',
      sub: 'Renews Nov 6, 2026',
    })
    expect(resolveStatus('connection', 'untested').sub).toBe('Test after saving')
    expect(settingsCategory('degraded').label).toBe('Needs attention')
  })

  it('posterPalette', () => {
    expect(posterPalette('12345')).toEqual({ ink: 'coral', field: '#f6795c', on: '#1f0b08' })
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
