/**
 * The `@example` blocks of lib/connections modules, run as written.
 */

import { parsePlexExternalIds } from '@/lib/connections/plex-guids'
import { plexTvOrigin } from '@/lib/connections/plex-tv-origin'

describe('JSDoc Documentation Examples', () => {
  it('parsePlexExternalIds reads Guid tags and a legacy guid', () => {
    expect(parsePlexExternalIds('plex://movie/5d77…', ['imdb://tt0137523', 'tmdb://550'])).toEqual({
      imdb: 'tt0137523',
      tmdb: 550,
    })
    expect(parsePlexExternalIds('com.plexapp.agents.thetvdb://73244/1/1?lang=en', [])).toEqual({ tvdb: 73244 })
  })

  it('plexTvOrigin is plex.tv unless the E2E mock is on at a loopback address', () => {
    expect(plexTvOrigin({})).toBe('https://plex.tv')
    expect(plexTvOrigin({ E2E_TEST_MODE: 'true', E2E_PLEX_TV_URL: 'http://127.0.0.1:2527' })).toBe('http://127.0.0.1:2527')
    expect(plexTvOrigin({ E2E_TEST_MODE: 'true', E2E_PLEX_TV_URL: 'http://plex.example.com' })).toBe('https://plex.tv')
  })
})
