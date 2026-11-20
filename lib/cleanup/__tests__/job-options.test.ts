/**
 * @jest-environment node
 */

/**
 * Every add of a media cleanup job carries `CLEANUP_JOB_OPTIONS` (TS 9.2):
 * one attempt, so a failed act job or collection sync waits on the Queues
 * page for an admin's Retry. The request-path queue's own defaults retry 3
 * times, which would send more Radarr and Sonarr deletes with no person
 * (security review S-02).
 *
 * The check reads the source: each call of `enqueueFromRequest`, `addJob`
 * or `scheduleCronJob` in a file that names a cleanup job type must pass
 * `CLEANUP_JOB_OPTIONS` in its arguments.
 */

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { CLEANUP_JOB_OPTIONS } from "@/lib/cleanup/constants"

const ROOT = path.resolve(__dirname, "../../..")
const SOURCE_DIRS = ["actions", "lib"]
const CALL = /\b(enqueueFromRequest|addJob|scheduleCronJob)\(/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "__tests__" || entry.name === "generated" ? [] : sourceFiles(full)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : []
  })
}

/** The argument text of the call whose opening parenthesis ends at `start`. */
function argumentsAt(source: string, start: number): string {
  let depth = 1
  for (let i = start; i < source.length; i++) {
    if (source[i] === "(") depth += 1
    if (source[i] === ")" && --depth === 0) return source.slice(start, i)
  }
  return source.slice(start)
}

/** Each queue add of a file that names a cleanup job type, as `file: call`. */
function cleanupAdds(): { where: string; args: string }[] {
  const files = SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir)))
  return files.flatMap((file) => {
    const source = readFileSync(file, "utf8")
    if (!source.includes("JOB_TYPES.CLEANUP_")) return []
    return [...source.matchAll(CALL)]
      .filter((match) => !/\bfunction\s+$/.test(source.slice(Math.max(0, (match.index ?? 0) - 9), match.index)))
      .map((match) => ({ where: `${path.relative(ROOT, file)}: ${match[1]}`, args: argumentsAt(source, (match.index ?? 0) + match[0].length) }))
  })
}

describe("cleanup job options", () => {
  it("are one attempt that is kept for a week after a failure", () => {
    expect(CLEANUP_JOB_OPTIONS).toEqual({ attempts: 1, removeOnComplete: true, removeOnFail: { age: 7 * 24 * 3600 } })
  })

  it("go with every add of a cleanup job, the approval's act job and the collection sync included", () => {
    const adds = cleanupAdds()
    expect(adds.map((add) => add.where)).toEqual(expect.arrayContaining(["actions/admin/cleanup-items.ts: enqueueFromRequest",
      "lib/cleanup/collections/request.ts: enqueueFromRequest", "lib/queue/jobs/cleanup.ts: addJob", "lib/cleanup/schedule.ts: scheduleCronJob"]))
    expect(adds.filter((add) => !add.args.includes("CLEANUP_JOB_OPTIONS")).map((add) => add.where)).toEqual([])
  })
})
