#!/usr/bin/env node
/**
 * Writes `lib/rewind/cards/card-version.generated.ts` (plan step P2.14).
 * The rules live in `scripts/card-version/compute.mjs`;
 * `lib/rewind/cards/__tests__/card-version.test.ts` fails CI when the
 * committed value is stale.
 *
 *   npm run rewind:card-version
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { computeCardVersion, GENERATED, generatedSource } from './card-version/compute.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const version = computeCardVersion(ROOT)
writeFileSync(join(ROOT, ...GENERATED), generatedSource(version))
console.log(version)
