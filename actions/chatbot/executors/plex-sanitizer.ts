interface RawPlexSessionsResponse {
  MediaContainer?: {
    size?: number
    Metadata?: RawPlexSession | RawPlexSession[]
  }
}

interface RawPlexSession {
  title?: string
  grandparentTitle?: string
  parentTitle?: string
  type?: string
  year?: number | string
  duration?: number | string
  viewOffset?: number | string
  librarySectionTitle?: string
  parentIndex?: number | string
  index?: number | string
  originallyAvailableAt?: string
  Player?: RawPlexPlayer
  Session?: RawPlexSessionInfo
  Media?: RawPlexMedia | RawPlexMedia[]
}

interface RawPlexPlayer {
  product?: string
  platform?: string
  device?: string
  state?: string
}

interface RawPlexSessionInfo {
  location?: string
  bandwidth?: number | string
  videoDecision?: string
  audioDecision?: string
  transcodeDecision?: string
}

interface RawPlexMedia {
  videoResolution?: string | number
  audioCodec?: string
  videoCodec?: string
  container?: string
  bitrate?: number | string
}

export interface SanitizedPlexSessions {
  totalSessions: number
  privacy: string
  sessions: SanitizedPlexSession[]
}

interface SanitizedPlexSession {
  viewerLabel: string
  mediaTitle?: string
  mediaType?: string
  librarySection?: string
  year?: number
  seasonEpisode?: string
  device?: string
  platform?: string
  playbackState?: string
  location?: "local" | "remote" | "unknown"
  bandwidthMbps?: number
  progressPercent?: number
  streamDecision?: string
  notes?: string[]
}

export function sanitizePlexSessionsPayload(raw: unknown): SanitizedPlexSessions {
  const container = getMediaContainer(raw)
  const metadata = normalizeArray(container?.Metadata)

  return {
    totalSessions: metadata.length,
    privacy: "Viewer identifiers removed for privacy compliance.",
    sessions: metadata.map((item, index) => sanitizeSingleSession(item, index)),
  }
}

function sanitizeSingleSession(item: RawPlexSession, index: number): SanitizedPlexSession {
  const mediaTitle = buildMediaTitle(item)
  const progressPercent = calculateProgress(item.viewOffset, item.duration)
  const bandwidthMbps = normalizeNumber(item.Session?.bandwidth)
  const location = normalizeLocation(item.Session?.location)
  const notes = collectNotes(item)

  return {
    viewerLabel: `Viewer ${index + 1}`,
    mediaTitle,
    mediaType: normalizeString(item.type),
    librarySection: normalizeString(item.librarySectionTitle),
    year: normalizeNumber(item.year),
    seasonEpisode: buildSeasonEpisode(item.parentIndex, item.index),
    device: normalizeString(item.Player?.product ?? item.Player?.device),
    platform: normalizeString(item.Player?.platform),
    playbackState: normalizeString(item.Player?.state),
    location,
    bandwidthMbps: bandwidthMbps !== undefined ? Number((bandwidthMbps / 1000).toFixed(2)) : undefined,
    progressPercent,
    streamDecision: normalizeString(item.Session?.transcodeDecision ?? item.Session?.videoDecision ?? item.Session?.audioDecision),
    notes: notes.length > 0 ? notes : undefined,
  }
}

function buildMediaTitle(item: RawPlexSession): string | undefined {
  const type = normalizeString(item.type)
  const baseTitle = normalizeString(item.title)
  const seriesTitle = normalizeString(item.grandparentTitle)
  const parentTitle = normalizeString(item.parentTitle)

  if (!type || type === "movie") {
    return baseTitle ?? parentTitle ?? seriesTitle ?? undefined
  }

  const pieces = [seriesTitle, parentTitle, baseTitle].filter(Boolean)
  if (pieces.length === 0) {
    return undefined
  }
  return pieces.join(" · ")
}

function buildSeasonEpisode(seasonValue?: number | string, episodeValue?: number | string): string | undefined {
  const season = normalizeNumber(seasonValue)
  const episode = normalizeNumber(episodeValue)

  if (season === undefined && episode === undefined) {
    return undefined
  }

  const seasonLabel = season !== undefined ? `S${String(season).padStart(2, "0")}` : undefined
  const episodeLabel = episode !== undefined ? `E${String(episode).padStart(2, "0")}` : undefined

  return [seasonLabel, episodeLabel].filter(Boolean).join("")
}

function calculateProgress(viewOffset?: number | string, duration?: number | string): number | undefined {
  const offsetMs = normalizeNumber(viewOffset)
  const durationMs = normalizeNumber(duration)

  if (offsetMs === undefined || durationMs === undefined || durationMs <= 0) {
    return undefined
  }

  const percent = (offsetMs / durationMs) * 100
  return Number(percent.toFixed(1))
}

function normalizeLocation(location?: string): "local" | "remote" | "unknown" | undefined {
  if (!location) {
    return undefined
  }
  const value = location.toLowerCase()
  if (value === "lan") return "local"
  if (value === "wan") return "remote"
  return "unknown"
}

function collectNotes(item: RawPlexSession): string[] {
  const notes: string[] = []

  const medias = normalizeArray(item.Media)
  const firstMedia = medias[0]

  if (firstMedia?.videoResolution) {
    notes.push(`Resolution: ${formatResolution(firstMedia.videoResolution)}`)
  }

  if (firstMedia?.videoCodec) {
    notes.push(`Video codec: ${firstMedia.videoCodec}`)
  }

  if (firstMedia?.audioCodec) {
    notes.push(`Audio codec: ${firstMedia.audioCodec}`)
  }

  if (firstMedia?.bitrate) {
    const bitrate = normalizeNumber(firstMedia.bitrate)
    if (bitrate !== undefined) {
      notes.push(`Bitrate: ${Math.round(bitrate / 1000)} Mbps`)
    }
  }

  return notes
}

function formatResolution(value: string | number): string {
  if (typeof value === "number") {
    return `${value}p`
  }

  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) {
    return `${trimmed}p`
  }
  return trimmed
}

function getMediaContainer(raw: unknown): RawPlexSessionsResponse["MediaContainer"] | undefined {
  if (!isRecord(raw)) return undefined
  const container = raw.MediaContainer
  if (!isRecord(container)) return undefined
  return container
}

function normalizeArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

function normalizeString(value?: string | number | null): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  if (typeof value === "number") {
    return String(value)
  }
  return undefined
}

function normalizeNumber(value?: number | string | null): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null
}
