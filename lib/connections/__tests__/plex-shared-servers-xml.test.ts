/**
 * Tests for lib/connections/plex-shared-servers-xml.ts: parsing plex.tv's
 * shared_servers document into each member's shared section keys (SEC-21).
 */

import { readFileSync } from 'fs'
import path from 'path'

import {
  filtersOf,
  keysOf,
  parseSharedServersDocument,
  parseSharedServersXml,
  type SharedServersDocument,
} from '@/lib/connections/plex-shared-servers-xml'

const SHARED_SERVERS_XML = readFileSync(
  path.join(__dirname, 'fixtures', 'plex-tv-shared-servers.xml'),
  'utf8'
)

const FILTERED_XML = readFileSync(
  path.join(__dirname, '..', '..', 'cleanup', '__tests__', 'fixtures', 'plex-shared-servers-filtered.xml'),
  'utf8'
)

function document(xml: string): SharedServersDocument {
  const parsed = parseSharedServersDocument(xml)
  if (!parsed) throw new Error('the fixture has no MediaContainer')
  return parsed
}

function parse(sharedServers: string) {
  return parseSharedServersXml(`<MediaContainer size="1">${sharedServers}</MediaContainer>`)
}

describe('parseSharedServersXml', () => {
  describe('the shared_servers fixture', () => {
    it('collects the shared section keys of each user', () => {
      const byUser = parseSharedServersXml(SHARED_SERVERS_XML)

      expect(byUser).not.toBeNull()
      expect(byUser?.get('1001')).toEqual(new Set(['1', '3']))
      expect(byUser?.get('1002')).toEqual(new Set(['2']))
    })

    it("returns 'all' for a user whose share covers every library", () => {
      expect(parseSharedServersXml(SHARED_SERVERS_XML)?.get('1003')).toBe('all')
    })

    it('drops the sections a content filter restricts', () => {
      // dana's movies are filtered to contentRating=G; her TV share is not
      expect(parseSharedServersXml(SHARED_SERVERS_XML)?.get('1004')).toEqual(new Set(['2']))
    })

    it('skips invites that are not tied to a Plex account yet', () => {
      const byUser = parseSharedServersXml(SHARED_SERVERS_XML)

      expect(byUser?.has('0')).toBe(false)
      expect(byUser?.size).toBe(4)
    })
  })

  it('reads a single SharedServer with a single Section', () => {
    const byUser = parse('<SharedServer userID="42" allLibraries="0"><Section key="7" shared="1"/></SharedServer>')

    expect(byUser?.get('42')).toEqual(new Set(['7']))
  })

  it('treats a server with no shares as an empty list', () => {
    expect(parseSharedServersXml('<MediaContainer size="0" identifier="x"/>')?.size).toBe(0)
  })

  it('rejects a document without a MediaContainer', () => {
    expect(parseSharedServersXml('<html><body>Gateway timeout</body></html>')).toBeNull()
  })

  describe('malformed items', () => {
    it('skips a section without a key and keeps its siblings', () => {
      const byUser = parse(`<SharedServer userID="42" allLibraries="0">
        <Section title="No key" shared="1"/>
        <Section/>
        <Section key="7" shared="1"/>
      </SharedServer>`)

      expect(byUser?.get('42')).toEqual(new Set(['7']))
    })

    it('skips a malformed share and keeps the other users', () => {
      const byUser = parse(`<SharedServer/>
        <SharedServer userID="42" allLibraries="1"/>`)

      expect(byUser?.size).toBe(1)
      expect(byUser?.get('42')).toBe('all')
    })
  })

  describe('several entries for one user', () => {
    it('merges their sections', () => {
      const byUser = parse(`<SharedServer userID="42" allLibraries="0"><Section key="1" shared="1"/></SharedServer>
        <SharedServer userID="42" allLibraries="0"><Section key="2" shared="1"/><Section key="3" shared="0"/></SharedServer>`)

      expect(byUser?.get('42')).toEqual(new Set(['1', '2']))
    })

    it("keeps 'all' when any entry shares every library", () => {
      const byUser = parse(`<SharedServer userID="42" allLibraries="1"/>
        <SharedServer userID="42" allLibraries="0"><Section key="2" shared="1"/></SharedServer>`)

      expect(byUser?.get('42')).toBe('all')
    })
  })

  describe('content filters', () => {
    const sections = `<Section key="1" type="movie" shared="1"/>
      <Section key="2" type="show" shared="1"/>
      <Section key="3" type="artist" shared="1"/>`

    it('drops every section under filterAll', () => {
      const byUser = parse(`<SharedServer userID="42" allLibraries="0" filterAll="label=kids">${sections}</SharedServer>`)

      expect(byUser?.get('42')).toEqual(new Set())
    })

    it('drops only the sections of the filtered type', () => {
      const byUser = parse(`<SharedServer userID="42" allLibraries="0" filterTelevision="contentRating=TV-Y">${sections}</SharedServer>`)

      expect(byUser?.get('42')).toEqual(new Set(['1', '3']))
    })

    it("turns an all-libraries share with a filter into its unfiltered sections, never 'all'", () => {
      const byUser = parse(`<SharedServer userID="42" allLibraries="1" filterMovies="contentRating=G">${sections}</SharedServer>`)

      expect(byUser?.get('42')).toEqual(new Set(['2', '3']))
    })

    it('drops a section of unknown type when any filter is set', () => {
      const byUser = parse(`<SharedServer userID="42" allLibraries="0" filterMusic="label=x">
        <Section key="1" shared="1"/>
        <Section key="2" type="show" shared="1"/>
      </SharedServer>`)

      expect(byUser?.get('42')).toEqual(new Set(['2']))
    })

    it('ignores empty filter attributes', () => {
      const byUser = parse(`<SharedServer userID="42" allLibraries="1" filterAll="" filterMovies="" filterTelevision=""/>`)

      expect(byUser?.get('42')).toBe('all')
    })
  })
})

describe('parseSharedServersDocument and keysOf', () => {
  it('give the same keys as parseSharedServersXml', () => {
    expect(keysOf(document(SHARED_SERVERS_XML))).toEqual(parseSharedServersXml(SHARED_SERVERS_XML))
    expect(keysOf(document(FILTERED_XML))).toEqual(parseSharedServersXml(FILTERED_XML))
  })

  it('keep each valid entry with its user, and skip invites and malformed entries', () => {
    const parsed = document(`<MediaContainer><SharedServer/><SharedServer userID="0"/><SharedServer userID="42"/></MediaContainer>`)

    expect(parsed.shares.map((entry) => entry.userId)).toEqual(['42'])
  })

  it('refuse a document without a MediaContainer', () => {
    expect(parseSharedServersDocument('<html>Gateway timeout</html>')).toBeNull()
  })

  it('still drop every filtered section from the keys', () => {
    const keys = parseSharedServersXml(FILTERED_XML)

    expect(keys?.get('2001')).toEqual(new Set(['2']))
    expect(keys?.get('2004')).toEqual(new Set())
  })
})

describe('filtersOf', () => {
  const filters = filtersOf(document(FILTERED_XML))

  it('keeps a section with filterMovies="label!=Untranscodable" and returns its text', () => {
    expect(filters.get('2001')).toEqual(
      new Map([
        ['1', 'label!=Untranscodable'],
        ['2', null],
      ])
    )
  })

  it('gives null for a section with no filter', () => {
    expect(filters.get('2002')).toEqual(
      new Map([
        ['1', null],
        ['2', null],
      ])
    )
  })

  it('keeps another filter form as text, for the caller to judge', () => {
    expect(filters.get('2003')).toEqual(
      new Map([
        ['1', 'contentRating=G'],
        ['2', 'label!=Kids%2CAnime'],
      ])
    )
  })

  it('joins filterAll and the type filter with |, so both must pass', () => {
    expect(filters.get('2004')).toEqual(
      new Map([
        ['1', 'label!=Private|label!=Untranscodable'],
        ['2', 'label!=Private'],
        ['3', 'label!=Private|label!=Untranscodable'],
      ])
    )
  })

  it('hides a section that two entries of one user give two filter texts, and keeps a section only one shares', () => {
    expect(filters.get('2005')).toEqual(new Map([['2', null]]))
  })

  it('hides a section that one entry shares with no filter and another with label!=X', () => {
    expect(filters.get('2006')).toEqual(new Map())
  })

  it('keeps a section that two entries give the same text', () => {
    const byUser = filtersOf(
      document(`<MediaContainer>
        <SharedServer userID="42" allLibraries="0" filterMovies="label!=A"><Section key="1" type="movie" shared="1"/></SharedServer>
        <SharedServer userID="42" allLibraries="0" filterMovies="label!=A"><Section key="1" type="movie" shared="1"/></SharedServer>
      </MediaContainer>`)
    )

    expect(byUser.get('42')).toEqual(new Map([['1', 'label!=A']]))
  })

  it('keeps a hidden section hidden when a third entry agrees with one of the first two', () => {
    const byUser = filtersOf(
      document(`<MediaContainer>
        <SharedServer userID="42" allLibraries="0" filterMovies="label!=A"><Section key="1" type="movie" shared="1"/></SharedServer>
        <SharedServer userID="42" allLibraries="0"><Section key="1" type="movie" shared="1"/></SharedServer>
        <SharedServer userID="42" allLibraries="0"><Section key="1" type="movie" shared="1"/></SharedServer>
      </MediaContainer>`)
    )

    expect(byUser.get('42')).toEqual(new Map())
  })

  it('hides a section of unknown type under any filter, and shows it with none', () => {
    const byUser = filtersOf(
      document(`<MediaContainer>
        <SharedServer userID="42" allLibraries="0" filterMusic="label=x"><Section key="1" shared="1"/><Section key="2" type="show" shared="1"/></SharedServer>
        <SharedServer userID="43" allLibraries="0"><Section key="1" shared="1"/></SharedServer>
      </MediaContainer>`)
    )

    expect(byUser.get('42')).toEqual(new Map([['2', null]]))
    expect(byUser.get('43')).toEqual(new Map([['1', null]]))
  })

  it("gives 'all' to a user whose every entry shares all libraries with no filter, listed sections or not", () => {
    const byUser = filtersOf(
      document(`<MediaContainer>
        <SharedServer userID="42" allLibraries="1"/>
        <SharedServer userID="43" allLibraries="1" filterAll=""><Section key="1" type="movie" shared="1"/></SharedServer>
        <SharedServer userID="43" allLibraries="1"/>
      </MediaContainer>`)
    )

    expect(byUser.get('42')).toBe('all')
    expect(byUser.get('43')).toBe('all')
  })

  it('merges an unfiltered all-libraries entry with a filtered one section by section', () => {
    const byUser = filtersOf(
      document(`<MediaContainer>
        <SharedServer userID="42" allLibraries="1"><Section key="1" type="movie" shared="0"/><Section key="2" type="show" shared="0"/></SharedServer>
        <SharedServer userID="42" allLibraries="0" filterMovies="label!=X"><Section key="1" type="movie" shared="1"/></SharedServer>
      </MediaContainer>`)
    )

    expect(byUser.get('42')).toEqual(new Map([['2', null]]))
  })

  it('gives no section to a filtered all-libraries entry that lists none', () => {
    expect(filtersOf(document('<MediaContainer><SharedServer userID="42" allLibraries="1" filterMovies="label!=X"/></MediaContainer>')).get('42')).toEqual(new Map())
  })

  it('skips sections that are not shared or have no key, and invites without an account', () => {
    const one = filters.get('2001')
    expect(one).toBeInstanceOf(Map)
    expect(one instanceof Map && one.has('3')).toBe(false)
    expect(filters.has('0')).toBe(false)
    expect(filtersOf(document('<MediaContainer><SharedServer userID="42"><Section shared="1"/></SharedServer></MediaContainer>')).get('42')).toEqual(
      new Map()
    )
  })
})
