import { isImmersiveRoute, isNavActive, memberNav } from '@/lib/member/nav'

describe('memberNav', () => {
  it('starts with Home, adds "Rewind {year}" when the member can open it, and ends with Help', () => {
    expect(memberNav({ rewindYear: null, membership: false }).map((item) => item.label)).toEqual(['Home', 'Help'])
    expect(memberNav({ rewindYear: 2026, membership: false })).toEqual([
      { href: '/', label: 'Home', match: 'exact' },
      { href: '/rewind', label: 'Rewind 2026', match: 'prefix' },
      { href: '/help', label: 'Help', match: 'exact' },
    ])
  })

  it('adds Membership before Help when the member has that page', () => {
    expect(memberNav({ rewindYear: null, membership: true }).map((item) => item.href)).toEqual([
      '/',
      '/membership',
      '/help',
    ])
  })
})

describe('isNavActive', () => {
  const [home, rewind] = memberNav({ rewindYear: 2026, membership: false })

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
