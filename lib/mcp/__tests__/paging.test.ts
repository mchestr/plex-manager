/**
 * @jest-environment node
 */
import { z } from 'zod'

import { matches, pageFields, paginate } from '@/lib/mcp/paging'

const rows = Array.from({ length: 7 }, (_, index) => index + 1)

describe('paginate', () => {
  it('returns one page with its place in the whole', () => {
    expect(paginate(rows, 2, 3)).toEqual({ total: 7, page: 2, pageSize: 3, totalPages: 3, showing: 'showing 4-6 of 7', rows: [4, 5, 6] })
  })

  it('returns a short last page', () => {
    expect(paginate(rows, 3, 3)).toMatchObject({ showing: 'showing 7-7 of 7', rows: [7] })
  })

  it('says when a page is past the end', () => {
    expect(paginate(rows, 4, 3)).toMatchObject({ showing: 'none on page 4; there are 7', rows: [] })
  })

  it('says when there is nothing', () => {
    expect(paginate([], 1, 10)).toEqual({ total: 0, page: 1, pageSize: 10, totalPages: 0, showing: 'none', rows: [] })
  })
})

describe('pageFields', () => {
  const schema = z.object(pageFields(20, 50))

  it('defaults to page 1 of the default size', () => {
    expect(schema.parse({})).toEqual({ page: 1, pageSize: 20 })
  })

  it('refuses a page size over the maximum', () => {
    expect(schema.safeParse({ pageSize: 51 }).success).toBe(false)
    expect(schema.safeParse({ page: 0 }).success).toBe(false)
  })
})

describe('matches', () => {
  it('matches any field, ignoring case, and everything when empty', () => {
    expect(matches('sam', null, 'Sam Rivera')).toBe(true)
    expect(matches('SAM', 'sam@example.com')).toBe(true)
    expect(matches('kim', 'Sam', undefined)).toBe(false)
    expect(matches('', null)).toBe(true)
  })
})
