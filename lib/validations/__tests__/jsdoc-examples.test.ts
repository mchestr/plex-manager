import { safeCallbackPath } from '@/lib/validations/callback-path'
import { yearParamSchema } from '@/lib/validations/params'
import { readYearParam } from '@/lib/validations/year-range'

describe('JSDoc Documentation Examples', () => {
  it('readYearParam: four digits in range read as a year', () => {
    expect(readYearParam('2026')).toBe(2026)
    expect(readYearParam('26')).toBeNull()
  })

  it('readYearParam agrees with yearParamSchema', () => {
    for (const value of ['2026', '2010', '2100', '2009', '2101', '26', '02026', '20x6', '', ' 2026']) {
      const parsed = yearParamSchema.safeParse(value)
      expect(readYearParam(value)).toBe(parsed.success ? parsed.data : null)
    }
  })

  it('safeCallbackPath keeps same-origin paths only', () => {
    expect(safeCallbackPath('/admin')).toBe('/admin')
    expect(safeCallbackPath('/rewind/2026?from=home#top')).toBe('/rewind/2026?from=home#top')
    expect(safeCallbackPath('https://evil.example/')).toBeNull()
    expect(safeCallbackPath('//evil.example')).toBeNull()
    expect(safeCallbackPath('/a/..//evil.example')).toBeNull()
  })
})
