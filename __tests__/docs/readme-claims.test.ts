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

  it.each(['Rewind', 'Stripe', 'Jellyfin', 'Invites', 'Watchlist Sync', 'Assistants'])('the feature list names %s', (feature) => {
    expect(features(readme)).toContain(`### ${feature}`)
  })

  it('links every operator doc from the Deployment section', () => {
    const start = readme.indexOf('\n## Deployment\n')
    const deployment = readme.slice(start, readme.indexOf('\n### ', start))
    for (const doc of ['deployment', 'environment', 'domain-move', 'operations', 'rewind', 'privacy', 'stripe', 'discord-bot']) {
      expect(deployment).toContain(`(docs/${doc}.md)`)
    }
    expect(deployment).toContain('(CHANGELOG.md)')
  })
})
