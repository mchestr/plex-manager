import { memberServices, primaryService, type MemberIdentity } from '@/lib/members/service'
import type { AuthService } from '@/types/onboarding'

const PLEX: MemberIdentity = { plexUserId: 'plex-1', jellyfinUserId: null }
const JELLYFIN: MemberIdentity = { plexUserId: null, jellyfinUserId: 'jf-1' }
const BOTH: MemberIdentity = { plexUserId: 'plex-1', jellyfinUserId: 'jf-1' }
const NEITHER: MemberIdentity = { plexUserId: null, jellyfinUserId: null }

describe('memberServices', () => {
  it('lists each linked service, Plex first', () => {
    expect(memberServices(PLEX)).toEqual(['plex'])
    expect(memberServices(JELLYFIN)).toEqual(['jellyfin'])
    expect(memberServices(BOTH)).toEqual(['plex', 'jellyfin'])
    expect(memberServices(NEITHER)).toEqual([])
  })

  it('treats an empty identifier as unlinked', () => {
    expect(memberServices({ plexUserId: '', jellyfinUserId: 'jf-1' })).toEqual(['jellyfin'])
  })
})

describe('primaryService', () => {
  const cases: [string, MemberIdentity, AuthService | null, AuthService][] = [
    ['Plex only, stored plex', PLEX, 'plex', 'plex'],
    ['Plex only, stored jellyfin (unlinked)', PLEX, 'jellyfin', 'plex'],
    ['Plex only, nothing stored', PLEX, null, 'plex'],
    ['Jellyfin only, stored jellyfin', JELLYFIN, 'jellyfin', 'jellyfin'],
    ['Jellyfin only, stored plex (unlinked)', JELLYFIN, 'plex', 'jellyfin'],
    ['Jellyfin only, nothing stored', JELLYFIN, null, 'jellyfin'],
    ['both, stored jellyfin', BOTH, 'jellyfin', 'jellyfin'],
    ['both, stored plex', BOTH, 'plex', 'plex'],
    ['both, nothing stored', BOTH, null, 'plex'],
    ['neither, stored jellyfin', NEITHER, 'jellyfin', 'plex'],
    ['neither, nothing stored', NEITHER, null, 'plex'],
  ]

  it.each(cases)('%s', (_label, identity, stored, expected) => {
    expect(primaryService({ ...identity, primaryAuthService: stored })).toBe(expected)
  })
})
