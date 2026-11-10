/**
 * Tests for plexTvOrigin: plex.tv, or the Playwright mock only while
 * E2E_TEST_MODE is on and the mock is at a loopback address.
 */

import { plexTvOrigin } from '@/lib/connections/plex-tv-origin'

describe('plexTvOrigin', () => {
  it('is plex.tv by default', () => {
    expect(plexTvOrigin({})).toBe('https://plex.tv')
  })

  it.each(['http://127.0.0.1:2527', 'http://localhost:2527', 'http://[::1]:2527'])(
    'is the E2E mock at %s while E2E_TEST_MODE is on',
    (url) => {
      expect(plexTvOrigin({ E2E_TEST_MODE: 'true', E2E_PLEX_TV_URL: url })).toBe(url)
    }
  )

  it('drops a path from the mock address', () => {
    expect(plexTvOrigin({ E2E_TEST_MODE: 'true', E2E_PLEX_TV_URL: 'http://127.0.0.1:2527/api' })).toBe('http://127.0.0.1:2527')
  })

  it.each([
    ['without E2E_TEST_MODE', { E2E_PLEX_TV_URL: 'http://127.0.0.1:2527' }],
    ['with E2E_TEST_MODE set to something else', { E2E_TEST_MODE: '1', E2E_PLEX_TV_URL: 'http://127.0.0.1:2527' }],
    ['for a host that is not loopback', { E2E_TEST_MODE: 'true', E2E_PLEX_TV_URL: 'http://plex.example.com:2527' }],
    ['for https', { E2E_TEST_MODE: 'true', E2E_PLEX_TV_URL: 'https://127.0.0.1:2527' }],
    ['for a loopback name inside a longer host', { E2E_TEST_MODE: 'true', E2E_PLEX_TV_URL: 'http://localhost.example.com' }],
    ['for an address that does not parse', { E2E_TEST_MODE: 'true', E2E_PLEX_TV_URL: 'not a url' }],
  ])('stays plex.tv %s', (_label, env) => {
    expect(plexTvOrigin(env)).toBe('https://plex.tv')
  })
})
