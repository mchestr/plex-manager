/**
 * Two Plex calls the problem report fixes make with the owner token
 * (docs/problem-reports.md), each answered by Plex at once while the work
 * runs on the server:
 *
 * - {@link refreshPlexItem}: `PUT /library/metadata/<ratingKey>/refresh`,
 *   which reads the item's details from its agent again;
 * - {@link scanPlexFolder}: `GET /library/sections/<id>/refresh?path=<folder>`,
 *   which scans one folder of a library for new files.
 *
 * Neither removes anything. Rating keys and section ids must be digits.
 *
 * @module lib/connections/plex-library-actions
 */

import "server-only"

import { z } from "zod"

import { serviceFetch } from "@/lib/connections/http"
import { ratingKeySchema } from "@/lib/validations/params"

type PlexServer = { url: string; token: string }

const ACTION_TIMEOUT_MS = 10_000

async function send(server: PlexServer, method: "GET" | "PUT", path: string): Promise<boolean> {
  const result = await serviceFetch({
    service: "Plex",
    url: `${server.url}${path}`,
    method,
    headers: { "X-Plex-Token": server.token },
    schema: z.string(),
    responseType: "text",
    timeoutMs: ACTION_TIMEOUT_MS,
  })
  return result.ok
}

/** Asks Plex to read the item's details again. False when Plex refused or couldn't be reached. */
export async function refreshPlexItem(server: PlexServer, ratingKey: string): Promise<boolean> {
  if (!ratingKeySchema.safeParse(ratingKey).success) return false
  return send(server, "PUT", `/library/metadata/${encodeURIComponent(ratingKey)}/refresh`)
}

/** Asks Plex to scan one folder of a library section. False when Plex refused or couldn't be reached. */
export async function scanPlexFolder(server: PlexServer, sectionId: string, folder: string): Promise<boolean> {
  if (!ratingKeySchema.safeParse(sectionId).success || folder.trim() === "") return false
  return send(server, "GET", `/library/sections/${encodeURIComponent(sectionId)}/refresh?path=${encodeURIComponent(folder)}`)
}
