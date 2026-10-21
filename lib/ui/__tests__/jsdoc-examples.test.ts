/**
 * The @example blocks in lib/ui/markdown.ts, lib/ui/error-copy.ts,
 * lib/ui/status.ts, lib/ui/poster-palette.ts and lib/ui/flash-codes.ts.
 */

import { boundaryCopy, errorCopy } from '../error-copy'
import { nextAuthError, readFlash } from '../flash-codes'
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

  it('boundaryCopy', () => {
    expect(boundaryCopy(Object.assign(new Error('x'), { digest: 'PM_FORBIDDEN' })).title).toBe('Admins only')
    expect(boundaryCopy(Object.assign(new Error('db:5432'), { digest: 'abc123' })).code).toBe('abc123')
    expect(boundaryCopy(new Error('db:5432')).title).toBe('Something went wrong on our side')
  })

  it('readFlash', () => {
    const read = readFlash(new URLSearchParams('flash=discord_linked&tab=2'))
    expect(read?.toasts[0].title).toBe('Discord linked')
    expect(read?.query.toString()).toBe('tab=2')
    expect(readFlash(new URLSearchParams('error=Your account is locked'))?.toasts).toEqual([])
    expect(readFlash(new URLSearchParams('status=failed'))).toBeNull()
  })

  it('nextAuthError', () => {
    expect(nextAuthError('Verification').code).toBe('Verification')
    expect(nextAuthError('<script>alert(1)</script>').code).toBe('Default')
  })
})

describe('safeHref', () => {
  it.each([[null], [undefined], [''], ['ftp://example.com'], ['http://[bad']])('refuses %p', (href) => {
    expect(safeHref(href)).toBeNull()
  })
})
