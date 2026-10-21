import { isImmersiveRoute, isNavActive, memberNav } from '@/lib/member/nav'

describe('memberNav', () => {
  it('starts with Home and adds "Rewind {year}" when the member can open it', () => {
    expect(memberNav({ rewindYear: null }).map((item) => item.label)).toEqual(['Home'])
    expect(memberNav({ rewindYear: 2026 })).toEqual([
      { href: '/', label: 'Home', match: 'exact' },
      { href: '/rewind', label: 'Rewind 2026', match: 'prefix' },
    ])
  })
})

describe('isNavActive', () => {
  const [home, rewind] = memberNav({ rewindYear: 2026 })

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
