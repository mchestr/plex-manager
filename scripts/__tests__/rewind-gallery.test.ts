/**
 * @jest-environment node
 *
 * `npm run rewind:gallery` (P7.11): the plan lists every page of each fixture
 * at both sizes and every card, and the contact sheet links each file.
 */

import { parseGalleryArgs } from '../rewind-gallery'
import { contactSheet, galleryPlan, type FixtureSet } from '../rewind-gallery/plan'

jest.mock('@playwright/test', () => ({ chromium: {} }))

const ID = '0b6c1f7e-3c1a-4f7e-9d0a-2f4b8c6d1e3a'

const sets: FixtureSet[] = [
  {
    fixture: 'heavy',
    previewId: ID,
    pages: [
      { type: 'cover', folio: 1 },
      { type: 'number', folio: 2 },
      { type: 'centrefold', folio: 9 },
    ],
    cards: ['cover', 'number', 'centrefold'],
  },
  { fixture: 'postcard', previewId: ID, pages: [{ type: 'cover', folio: 1 }], cards: ['cover'] },
]

describe('galleryPlan', () => {
  const plan = galleryPlan(sets)

  it('lists every page at the phone size and the spread, and every card, of each fixture', () => {
    for (const set of sets) {
      const mine = plan.filter((shot) => shot.fixture === set.fixture)
      const pages = (view: string) => mine.filter((shot) => shot.kind === 'page' && shot.view === view).map((shot) => shot.page)
      expect(pages('phone')).toEqual(set.pages.map((p) => p.type))
      expect(pages('spread')).toEqual(set.pages.map((p) => p.type))
      expect(mine.filter((shot) => shot.kind === 'card').map((shot) => shot.page)).toEqual(set.cards)
    }
    expect(plan).toHaveLength(2 * 3 + 3 + 2 * 1 + 1)
  })

  it('names the files by folio and page, and reads the real routes', () => {
    expect(plan).toContainEqual({ kind: 'page', fixture: 'heavy', page: 'centrefold', view: 'phone', url: `/rewind/2026?preview=${ID}&page=centrefold&still=1`, file: 'heavy/09-centrefold.png' })
    expect(plan).toContainEqual(expect.objectContaining({ view: 'spread', page: 'centrefold', file: 'heavy/spread/09-centrefold.png' }))
    expect(plan).toContainEqual({ kind: 'card', fixture: 'heavy', page: 'centrefold', url: `/api/rewind/card/preview/${ID}/centrefold?daily=1`, file: 'heavy/cards/centrefold.png' })
    expect(new Set(plan.map((shot) => shot.file)).size).toBe(plan.length)
  })
})

describe('contactSheet', () => {
  it('links each file and has a section per fixture', () => {
    const plan = galleryPlan(sets)
    const html = contactSheet(plan, '2026-11-25')
    for (const shot of plan) expect(html).toContain(`<a href="${shot.file}">`)
    expect(html).toContain('<section id="heavy">')
    expect(html).toContain('<section id="postcard">')
    expect(html).toContain('<title>Rewind gallery 2026-11-25</title>')
  })
})

describe('parseGalleryArgs', () => {
  it('defaults to localhost:3000 and the page default copy', () => {
    expect(parseGalleryArgs([])).toEqual({ ok: true, args: { baseUrl: 'http://localhost:3000', copy: null } })
  })

  it('reads the base URL and the copy, and refuses anything else', () => {
    expect(parseGalleryArgs(['--base-url=http://localhost:3100/', '--copy=templates'])).toEqual({ ok: true, args: { baseUrl: 'http://localhost:3100', copy: 'templates' } })
    expect(parseGalleryArgs(['--base-url=nope']).ok).toBe(false)
    expect(parseGalleryArgs(['--copy=live']).ok).toBe(false)
    expect(parseGalleryArgs(['--apply']).ok).toBe(false)
  })
})
