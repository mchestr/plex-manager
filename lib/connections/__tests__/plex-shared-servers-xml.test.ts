/**
 * Tests for lib/connections/plex-shared-servers-xml.ts: parsing plex.tv's
 * shared_servers document into each member's shared section keys (SEC-21).
 */

import { readFileSync } from 'fs'
import path from 'path'

import { parseSharedServersXml } from '@/lib/connections/plex-shared-servers-xml'

const SHARED_SERVERS_XML = readFileSync(
  path.join(__dirname, 'fixtures', 'plex-tv-shared-servers.xml'),
  'utf8'
)

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
