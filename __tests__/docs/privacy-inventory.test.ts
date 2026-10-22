/**
 * @jest-environment node
 *
 * `docs/privacy.md` is the personal-data inventory that member removal, the
 * retention jobs and the export follow (P11.13), so every model in
 * `prisma/schema.prisma` must have a row in one of its tables, and the doc
 * must not list a model that no longer exists.
 */

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const schema = fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8')
const privacy = fs.readFileSync(path.join(ROOT, 'docs/privacy.md'), 'utf8')

const models = Array.from(schema.matchAll(/^model (\w+) \{/gm), (match) => match[1])
/** The first cell of every table row, when it is one inline-code name. */
const listed = Array.from(privacy.matchAll(/^\| `(\w+)` \|/gm), (match) => match[1])

describe('docs/privacy.md inventory', () => {
  it('reads the models from the schema', () => {
    expect(models.length).toBeGreaterThan(30)
  })

  it.each(models)('lists %s', (model) => {
    expect(listed).toContain(model)
  })

  it('lists only models that exist, each once', () => {
    expect(listed.filter((name) => !models.includes(name))).toEqual([])
    expect(new Set(listed).size).toBe(listed.length)
  })
})
