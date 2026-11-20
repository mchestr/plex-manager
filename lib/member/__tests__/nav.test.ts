import { isImmersiveRoute, isNavActive, memberNav } from '@/lib/member/nav'

describe('memberNav', () => {
  it('starts with Home, adds "Rewind {year}" when the member can open it, and ends with Help', () => {
    expect(memberNav({ leavingSoon: false, rewindYear: null, invites: false, membership: false }).map((item) => item.label)).toEqual(['Home', 'Help'])
    expect(memberNav({ leavingSoon: false, rewindYear: 2026, invites: false, membership: false })).toEqual([
      { href: '/', label: 'Home', match: 'exact' },
      { href: '/rewind', label: 'Rewind 2026', match: 'prefix' },
      { href: '/help', label: 'Help', match: 'exact' },
    ])
  })

  it('adds Membership before Help when the member has that page', () => {
    expect(memberNav({ leavingSoon: false, rewindYear: null, invites: false, membership: true }).map((item) => item.href)).toEqual([
      '/',
      '/membership',
      '/help',
    ])
  })

  it('adds Invites before Membership when the member has that page', () => {
    expect(memberNav({ leavingSoon: false, rewindYear: null, invites: true, membership: true }).map((item) => item.href)).toEqual([
      '/',
      '/invites',
      '/membership',
      '/help',
    ])
  })
})

describe('memberNav leavingSoon', () => {
  it('puts Leaving soon right after Home while the member sees it', () => {
    expect(memberNav({ leavingSoon: true, rewindYear: 2026, invites: true, membership: true })).toEqual([
      { href: '/', label: 'Home', match: 'exact' },
      { href: '/leaving-soon', label: 'Leaving soon', match: 'exact' },
      { href: '/rewind', label: 'Rewind 2026', match: 'prefix' },
      { href: '/invites', label: 'Invites', match: 'exact' },
      { href: '/membership', label: 'Membership', match: 'exact' },
      { href: '/help', label: 'Help', match: 'exact' },
    ])
  })

  it('leaves the item out otherwise', () => {
    expect(memberNav({ leavingSoon: false, rewindYear: null, invites: false, membership: false }).map((item) => item.href)).toEqual(['/', '/help'])
  })

  it('lights Leaving soon only on its own page', () => {
    const [, leaving] = memberNav({ leavingSoon: true, rewindYear: null, invites: false, membership: false })
    expect(isNavActive(leaving, '/leaving-soon')).toBe(true)
    expect(isNavActive(leaving, '/leaving-soon/more')).toBe(false)
    expect(isNavActive(leaving, '/')).toBe(false)
  })
})

describe('isNavActive', () => {
  const [home, rewind] = memberNav({ leavingSoon: false, rewindYear: 2026, invites: false, membership: false })

  it.each([
    ['/', true, false],
    ['/discord/link', false, false],
    ['/rewind', false, true],
    ['/rewind/2025/read', false, true],
    ['/rewinding', false, false],
  ])('%s lights Home %s and Rewind %s', (pathname, homeActive, rewindActive) => {
    expect(isNavActive(home, pathname)).toBe(homeActive)
    expect(isNavActive(rewind, pathname)).toBe(rewindActive)
  })
})

describe('isImmersiveRoute', () => {
  it('is every Rewind page and nothing else', () => {
    expect(isImmersiveRoute('/rewind')).toBe(true)
    expect(isImmersiveRoute('/rewind/2026')).toBe(true)
    expect(isImmersiveRoute('/')).toBe(false)
    expect(isImmersiveRoute('/discord/link')).toBe(false)
  })
})
