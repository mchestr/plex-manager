import { z } from "zod"

import { createPublicUrlSchema, createServerUrlSchema } from "./shared-schemas"

export const radarrSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  url: createServerUrlSchema("7878"),
  apiKey: z.string().min(1, "API key is required"),
  publicUrl: createPublicUrlSchema("radarr.example.com"),
})

export type RadarrInput = z.input<typeof radarrSchema>
export type RadarrParsed = z.output<typeof radarrSchema>

// Schema for Radarr server list response
export const radarrServerListSchema = z.object({
  servers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    })
  ),
})

export type RadarrServerList = z.infer<typeof radarrServerListSchema>

/**
 * Zod schema for Radarr queue item
 * Validates queue record structure from /api/v3/queue endpoint
 */
export const radarrQueueRecordSchema = z.object({
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
  movie: z.object({
    title: z.string().optional(),
  }).optional(),
})

export type RadarrQueueRecord = z.infer<typeof radarrQueueRecordSchema>

/**
 * Zod schema for Radarr queue response
 * Validates the queue response structure from /api/v3/queue endpoint
 */
export const radarrQueueResponseSchema = z.union([
  z.object({
    records: z.array(radarrQueueRecordSchema).optional(),
  }),
  z.array(radarrQueueRecordSchema),
])

export type RadarrQueueResponse = z.infer<typeof radarrQueueResponseSchema>

