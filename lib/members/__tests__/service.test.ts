import { memberServices, primaryService, serviceNames, type MemberIdentity } from '@/lib/members/service'

const PLEX: MemberIdentity = { plexUserId: 'plex-1' }
const NONE: MemberIdentity = { plexUserId: null }

describe('memberServices', () => {
  it('lists Plex when the member has a Plex account', () => {
    expect(memberServices(PLEX)).toEqual(['plex'])
    expect(memberServices(NONE)).toEqual([])
  })

  it('treats an empty identifier as unlinked', () => {
    expect(memberServices({ plexUserId: '' })).toEqual([])
  })
})

describe('serviceNames', () => {
  it('names the services as copy does', () => {
    expect(serviceNames(['plex'])).toBe('Plex')
    expect(serviceNames([])).toBe('')
  })
})

describe('primaryService', () => {
  it.each([
    ['Plex, stored plex', PLEX, 'plex'],
    ['Plex, nothing stored', PLEX, null],
    ['no account, nothing stored', NONE, null],
  ] as const)('%s', (_label, identity, stored) => {
    expect(primaryService({ ...identity, primaryAuthService: stored })).toBe('plex')
  })
})
