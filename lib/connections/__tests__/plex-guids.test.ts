/**
 * Tests for parsePlexExternalIds: the TMDB, TVDB and IMDb ids in a Plex item's
 * `Guid` tags (current agents) or its legacy agent `guid`.
 */

import { parsePlexExternalIds } from '@/lib/connections/plex-guids'

describe('parsePlexExternalIds', () => {
  it('reads the Guid tags of the current Plex agents', () => {
    const ids = parsePlexExternalIds('plex://movie/5d776b59ad5437001f79c6f8', [
      'imdb://tt0137523',
      'tmdb://550',
      'tvdb://194',
    ])

    expect(ids).toEqual({ imdb: 'tt0137523', tmdb: 550, tvdb: 194 })
  })

  it.each([
    ['com.plexapp.agents.imdb://tt0137523?lang=en', { imdb: 'tt0137523' }],
    ['com.plexapp.agents.themoviedb://550?lang=en', { tmdb: 550 }],
    ['com.plexapp.agents.thetvdb://73244?lang=en', { tvdb: 73244 }],
    ['com.plexapp.agents.thetvdb://73244/1/1?lang=en', { tvdb: 73244 }],
    ['com.plexapp.agents.thetvdbdvdorder://73244?lang=en', { tvdb: 73244 }],
    ['com.plexapp.agents.thetvdbdvdorder://73244/1/1?lang=en', { tvdb: 73244 }],
  ])('reads the legacy agent guid %s', (guid, expected) => {
    expect(parsePlexExternalIds(guid, [])).toEqual(expected)
  })

  it('prefers a Guid tag over the legacy guid', () => {
    expect(parsePlexExternalIds('com.plexapp.agents.themoviedb://551?lang=en', ['tmdb://550'])).toEqual({ tmdb: 550 })
  })

  it.each([
    ['a plex:// guid without tags', 'plex://show/5d9c086c46115600200aa2fe', []],
    ['a local item', 'local://12345', []],
    ['the none agent', 'com.plexapp.agents.none://12345?lang=xn', []],
    ['no guid at all', undefined, []],
    ['tags from an unknown source', undefined, ['anidb://123', 'mbid://abc']],
  ])('finds no ids in %s', (_label, guid, tags) => {
    expect(parsePlexExternalIds(guid, tags)).toEqual({})
  })

  it.each([
    ['a non-numeric TMDB id', ['tmdb://abc']],
    ['a zero TVDB id', ['tvdb://0']],
    ['an IMDb id without tt', ['imdb://0137523']],
    ['an id with a path after it', ['tmdb://550/../1']],
  ])('ignores %s', (_label, tags) => {
    expect(parsePlexExternalIds(undefined, tags)).toEqual({})
  })
})
