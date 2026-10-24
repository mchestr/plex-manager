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

  // start:prod works outside the image (P11.24): it runs the standalone server
  // where next build writes it, and postbuild copies in what that server needs.
  it('start:prod runs the standalone server that postbuild completes', () => {
    expect(pkg.scripts['start:prod']).toMatch(/^NEXT_MANUAL_SIG_HANDLE=true node .* \.next\/standalone\/server\.js$/)
    expect(pkg.scripts.postbuild).toBe('node scripts/copy-standalone-assets.mjs')
    const copier = fs.readFileSync(path.join(ROOT, 'scripts/copy-standalone-assets.mjs'), 'utf8')
    expect(copier).toContain('".next/static", ".next/standalone/.next/static"')
    expect(copier).toContain('"public", ".next/standalone/public"')
  })

  it('env:docs runs the environment reference generator', () => {
    expect(pkg.scripts['env:docs']).toContain('scripts/gen-env-reference.ts')
  })
})

describe('docker-compose.yml', () => {
  it('does not mount ./data', () => {
    const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8')
    expect(compose).not.toMatch(/\.\/data:/)
  })
})
