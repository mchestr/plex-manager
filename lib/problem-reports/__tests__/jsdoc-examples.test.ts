/**
 * The `@example` blocks of lib/problem-reports modules, run as written.
 */

import { reportTitle } from '@/lib/problem-reports/title'

describe('JSDoc Documentation Examples', () => {
  it('reportTitle names a movie and an episode', () => {
    expect(reportTitle({ title: 'Heat', year: 1995 })).toBe('Heat (1995)')
    expect(reportTitle({ title: 'Pilot', showTitle: 'The Office', seasonNumber: 1, episodeNumber: 1 })).toBe('The Office S1E1: Pilot')
  })
})
