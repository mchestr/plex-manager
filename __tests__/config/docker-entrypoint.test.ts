/**
 * @jest-environment node
 *
 * docker-entrypoint.sh logs pending migrations, applies them unless
 * SKIP_MIGRATIONS=true, and never starts the app after a failed deploy
 * (GAP-14, P1.10). A stub PRISMA_BIN records each call instead of running
 * Prisma, and the same stub stands in for the app command.
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const ENTRYPOINT = path.resolve(__dirname, '../../docker-entrypoint.sh')

// Appends its arguments to $STUB_LOG, and exits 1 when they match $STUB_FAIL.
const STUB = `#!/bin/sh
echo "$*" >> "$STUB_LOG"
if [ -n "$STUB_FAIL" ] && [ "$*" = "$STUB_FAIL" ]; then exit 1; fi
exit 0
`

let dir: string
let stub: string
let log: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'entrypoint-'))
  stub = path.join(dir, 'prisma-stub')
  log = path.join(dir, 'calls.log')
  fs.writeFileSync(stub, STUB, { mode: 0o755 })
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function run(env: Record<string, string> = {}) {
  const result = spawnSync('sh', [ENTRYPOINT, stub, 'start-app'], {
    env: { NODE_ENV: 'test', PATH: process.env.PATH ?? '', PRISMA_BIN: stub, STUB_LOG: log, ...env },
    encoding: 'utf8',
  })
  const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []
  return { status: result.status, stdout: result.stdout, calls }
}

describe('docker-entrypoint.sh', () => {
  it('checks status, deploys, then starts the app by default', () => {
    const { status, calls } = run()

    expect(status).toBe(0)
    expect(calls).toEqual(['migrate status', 'migrate deploy', 'start-app'])
  })

  it('treats SKIP_MIGRATIONS other than "true" as unset', () => {
    expect(run({ SKIP_MIGRATIONS: 'false' }).calls).toEqual(['migrate status', 'migrate deploy', 'start-app'])
  })

  it('logs the skip and starts without deploying when SKIP_MIGRATIONS=true', () => {
    const { status, stdout, calls } = run({ SKIP_MIGRATIONS: 'true' })

    expect(status).toBe(0)
    expect(stdout).toContain('SKIP_MIGRATIONS=true: not applying migrations')
    expect(calls).not.toContain('migrate deploy')
    expect(calls).toEqual(['migrate status', 'start-app'])
  })

  it('still starts when the status pre-flight fails', () => {
    const { status, calls } = run({ STUB_FAIL: 'migrate status' })

    expect(status).toBe(0)
    expect(calls).toEqual(['migrate status', 'migrate deploy', 'start-app'])
  })

  it('stops the start when migrate deploy fails', () => {
    const { status, calls } = run({ STUB_FAIL: 'migrate deploy' })

    expect(status).not.toBe(0)
    expect(calls).toEqual(['migrate status', 'migrate deploy'])
  })

  it("defaults PRISMA_BIN to the image's pinned CLI (P4.17)", () => {
    expect(fs.readFileSync(ENTRYPOINT, 'utf8')).toContain(
      'PRISMA_BIN="${PRISMA_BIN:-/opt/prisma-cli/node_modules/.bin/prisma}"'
    )
  })

  it("runs the CLI, and only the CLI, with NODE_PATH at the CLI's modules (P4.17)", () => {
    const record = path.join(dir, 'record-node-path')
    fs.writeFileSync(record, `#!/bin/sh\necho "$1 NODE_PATH=$NODE_PATH" >> "$STUB_LOG"\n`, { mode: 0o755 })

    const result = spawnSync('sh', [ENTRYPOINT, record, 'app'], {
      env: { NODE_ENV: 'test', PATH: process.env.PATH ?? '', PRISMA_BIN: record, STUB_LOG: log },
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(fs.readFileSync(log, 'utf8').trim().split('\n')).toEqual([
      'migrate NODE_PATH=/opt/prisma-cli/node_modules',
      'migrate NODE_PATH=/opt/prisma-cli/node_modules',
      'app NODE_PATH=',
    ])
  })
})
