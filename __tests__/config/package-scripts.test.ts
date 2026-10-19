/**
 * @jest-environment node
 *
 * The documented install and upgrade command exists, and the dev compose file
 * no longer mounts the unused ./data directory (GAP-11, P1.10).
 */

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')

describe('package scripts', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }

  it('db:deploy runs prisma migrate deploy', () => {
    expect(pkg.scripts['db:deploy']).toBe('prisma migrate deploy')
  })

  it('keeps the contributor scripts under their names', () => {
    expect(pkg.scripts['db:push']).toBe('prisma db push')
    expect(pkg.scripts['db:migrate']).toBe('prisma migrate dev')
  })
})

describe('docker-compose.yml', () => {
  it('does not mount ./data', () => {
    const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8')
    expect(compose).not.toMatch(/\.\/data:/)
  })
})
