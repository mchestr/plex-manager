/**
 * The `@example` blocks of lib/connections modules, run as written.
 */

import { parsePlexExternalIds } from '@/lib/connections/plex-guids'

describe('JSDoc Documentation Examples', () => {
  it('parsePlexExternalIds reads Guid tags and a legacy guid', () => {
    expect(parsePlexExternalIds('plex://movie/5d77…', ['imdb://tt0137523', 'tmdb://550'])).toEqual({
      imdb: 'tt0137523',
      tmdb: 550,
    })
    expect(parsePlexExternalIds('com.plexapp.agents.thetvdb://73244/1/1?lang=en', [])).toEqual({ tvdb: 73244 })
  })
})
