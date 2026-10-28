/**
 * @jest-environment node
 *
 * Install and upgrade docs use the command the image runs, `db:deploy`, and
 * never present `db:push` or `db:migrate` as anything but contributor-only
 * (GAP-11, GAP-14, P1.10).
 */

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')

/** The body under a heading, up to the next heading of the same or a higher level. */
function section(markdown: string, heading: string): string {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => line.trim() === heading)
  if (start === -1) throw new Error(`Heading not found: ${heading}`)
  const level = heading.indexOf(' ')
  const end = lines.findIndex(
    (line, i) => i > start && /^#{1,6} /.test(line) && line.indexOf(' ') <= level,
  )
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n')
}

const readme = read('README.md')
const claudeMd = read('CLAUDE.md')
const contributing = read('.github/CONTRIBUTING.md')

describe('install and upgrade docs', () => {
  it.each([
    ['README Upgrade', () => section(readme, '## Upgrade')],
    ['CONTRIBUTING development setup', () => section(contributing, '## Prepare a development environment')],
    ['docs/operations.md Upgrade', () => section(read('docs/operations.md'), '## Upgrade')],
    ['CLAUDE.md Deployment Checklist', () => section(claudeMd, '## Deployment Checklist')],
  ])('%s names db:deploy', (_name, body) => {
    expect(body()).toContain('npm run db:deploy')
  })

  it.each([
    ['README.md', readme],
    ['CLAUDE.md', claudeMd],
    ['.github/CONTRIBUTING.md', contributing],
  ])('every %s line naming db:push or db:migrate says contributor-only', (_file, markdown) => {
    const offenders = markdown
      .split('\n')
      .filter((line) => /db:(push|migrate)\b/.test(line))
      .filter((line) => !/contributor-only/i.test(line))
    expect(offenders).toEqual([])
  })

  it('docs/operations.md holds the backup, restore and dump rule', () => {
    const ops = read('docs/operations.md')
    expect(ops).toContain('pg_dump -U postgres -Fc plex_wrapped')
    expect(ops).toContain('pg_restore -U postgres -d postgres --clean --if-exists --create --no-owner')
    expect(ops).toContain('Take a dump before every deploy that carries a migration')
    expect(ops).toContain('SKIP_MIGRATIONS=true')
    expect(ops).toContain('prisma migrate resolve --applied')
  })
})
