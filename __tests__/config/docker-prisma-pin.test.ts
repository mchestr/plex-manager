/**
 * @jest-environment node
 *
 * The Docker image migrates with its own Prisma CLI (docker/prisma-cli, P4.17,
 * SEC-03). Its exact pins must be the versions the app was built and tested
 * with, so a Dependabot bump of the root lockfile fails here until the image's
 * copy follows.
 */

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../..')

interface Lockfile {
  packages: Record<string, { version?: string; dev?: boolean; dependencies?: Record<string, string> }>
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')) as T
}

const cli = readJson<{ dependencies: Record<string, string> }>('docker/prisma-cli/package.json')
const cliLock = readJson<Lockfile>('docker/prisma-cli/package-lock.json')
const rootLock = readJson<Lockfile>('package-lock.json')

describe('docker/prisma-cli', () => {
  it('pins exactly prisma and dotenv, the two packages prisma.config.ts imports', () => {
    expect(Object.keys(cli.dependencies).sort()).toEqual(['dotenv', 'prisma'])
    for (const version of Object.values(cli.dependencies)) {
      expect(version).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })

  it.each(['prisma', 'dotenv'])('pins %s at the version the root lockfile installs', (name) => {
    expect(cli.dependencies[name]).toBe(rootLock.packages[`node_modules/${name}`]?.version)
  })

  it.each(['prisma', 'dotenv'])('locks %s at its pin', (name) => {
    expect(cliLock.packages[''].dependencies).toEqual(cli.dependencies)
    expect(cliLock.packages[`node_modules/${name}`]?.version).toBe(cli.dependencies[name])
  })
})
