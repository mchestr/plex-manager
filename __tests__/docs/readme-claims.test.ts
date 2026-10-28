/**
 * @jest-environment node
 *
 * README claims that were false stay out, and the feature list names what
 * the app does (GAP-21, P11.26).
 */

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')

function features(markdown: string): string {
  const start = markdown.indexOf('\n## Features\n')
  const end = markdown.indexOf('\n## ', start + 1)
  return markdown.slice(start, end)
}

describe('README claims', () => {
  it.each(['Issue Reporting', 'PostgreSQL polling', 'Next.js 14', 'leaderboards', 'cd plex-wrapped', 'wrapped-viewer.png'])(
    'does not say "%s"',
    (phrase) => {
      expect(readme).not.toContain(phrase)
    },
  )

  it.each(['Rewind', 'Stripe', 'Jellyfin', 'Invites', 'Watchlist sync', 'Assistants'])('the feature list names %s', (feature) => {
    expect(features(readme).toLowerCase()).toContain(feature.toLowerCase())
  })

  it('links every operator doc from the Documentation section', () => {
    const start = readme.indexOf('\n## Documentation\n')
    const documentation = readme.slice(start, readme.indexOf('\n## ', start + 1))
    expect(start).toBeGreaterThan(-1)
    for (const doc of fs.readdirSync(path.join(ROOT, 'docs')).filter((name) => name.endsWith('.md'))) {
      if (doc === 'performance-testing.md') continue // contributor-facing; CONTRIBUTING.md is the way in
      expect(documentation).toContain(`(docs/${doc})`)
    }
    expect(documentation).toContain('(CHANGELOG.md)')
  })

  it('sends contributors to the contributing guide', () => {
    expect(readme).toContain('(.github/CONTRIBUTING.md)')
    expect(fs.existsSync(path.join(ROOT, '.github/CONTRIBUTING.md'))).toBe(true)
  })
})
