import { z } from "zod"

import { createPublicUrlSchema, createServerUrlSchema } from "./shared-schemas"

export const sonarrSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  url: createServerUrlSchema("8989"),
  apiKey: z.string().min(1, "API key is required"),
  publicUrl: createPublicUrlSchema("sonarr.example.com"),
})

export type SonarrInput = z.input<typeof sonarrSchema>
export type SonarrParsed = z.output<typeof sonarrSchema>

// Schema for Sonarr server list response
export const sonarrServerListSchema = z.object({
  servers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    })
  ),
})

export type SonarrServerList = z.infer<typeof sonarrServerListSchema>

/**
 * Zod schema for Sonarr queue item
 * Validates queue record structure from /api/v3/queue endpoint
 */
export const sonarrQueueRecordSchema = z.object({
  id: z.number(),
  title: z.string().optional(),
  status: z.string().optional(),
  trackedDownloadStatus: z.string().optional(),
  size: z.number().optional(),
  sizeleft: z.number().optional(),
  estimatedCompletionTime: z.string().nullable().optional(),
  quality: z.object({
    quality: z.object({
      name: z.string().optional(),
    }).optional(),
  }).optional(),
  series: z.object({
    title: z.string().optional(),
  }).optional(),
  episode: z.object({
    title: z.string().optional(),
    seasonNumber: z.number().optional(),
    episodeNumber: z.number().optional(),
  }).optional(),
})

export type SonarrQueueRecord = z.infer<typeof sonarrQueueRecordSchema>

/**
 * Zod schema for Sonarr queue response
 * Validates the queue response structure from /api/v3/queue endpoint
 */
export const sonarrQueueResponseSchema = z.union([
  z.object({
    records: z.array(sonarrQueueRecordSchema).optional(),
  }),
  z.array(sonarrQueueRecordSchema),
])

export type SonarrQueueResponse = z.infer<typeof sonarrQueueResponseSchema>

