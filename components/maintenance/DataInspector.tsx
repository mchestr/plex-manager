"use client"

import type { MediaItem } from "@/lib/maintenance/rule-evaluator"
import { useState } from "react"

interface DataInspectorProps {
  item: MediaItem | null
}

export function DataInspector({ item }: DataInspectorProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    core: true,
    plex: true,
    tautulli: true,
    radarr: true,
    sonarr: true,
    overseerr: false,
  })

  if (!item) {
    return (
      <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
        <div className="text-center py-6 text-slate-500 text-sm">
          <svg className="w-10 h-10 mx-auto mb-2 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p>Select media to inspect data</p>
        </div>
      </div>
    )
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  const toggleAll = () => {
    const allExpanded = Object.values(expandedSections).every(v => v)
    const newValue = !allExpanded
    setExpandedSections({
      core: newValue,
      plex: newValue,
      tautulli: newValue,
      radarr: newValue,
      sonarr: newValue,
      overseerr: newValue,
    })
  }

  // Type assertion helper
  const plex = item.plex as Record<string, unknown> | null | undefined
  const tautulli = item.tautulli as Record<string, unknown> | null | undefined
  const radarr = item.radarr as Record<string, unknown> | undefined
  const sonarr = item.sonarr as Record<string, unknown> | undefined
  const overseerr = item.overseerr as Record<string, unknown> | null | undefined

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-slate-400">Data Inspector</h3>
        <button
          onClick={toggleAll}
          className="text-xs text-cyan-400 hover:text-cyan-300"
        >
          {Object.values(expandedSections).every(v => v) ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {/* Core Info */}
        <ServiceSection
          title="Core"
          icon={<IconInfo />}
          isExpanded={expandedSections.core}
          onToggle={() => toggleSection('core')}
          color="cyan"
        >
          <FieldRow label="ID" value={item.id} />
          <FieldRow label="Title" value={item.title} />
          <FieldRow label="Year" value={item.year} />
          <FieldRow label="Media Type" value={item.mediaType} />
          <FieldRow label="Genres" value={item.genres?.join(', ') || null} />
          <FieldRow label="Play Count" value={item.playCount} />
          <FieldRow label="Last Watched" value={formatDate(item.lastWatchedAt)} />
          <FieldRow label="Added At" value={formatDate(item.addedAt)} />
        </ServiceSection>

        {/* Plex Section */}
        <ServiceSection
          title="Plex"
          subtitle={plex ? "In Library" : "Not in Plex"}
          icon={<IconPlex />}
          isExpanded={expandedSections.plex}
          onToggle={() => toggleSection('plex')}
          color={plex ? "amber" : "slate"}
          isEmpty={!plex}
        >
          {plex ? (
            <>
              <FieldRow label="Rating Key" value={plex.ratingKey} />
              <FieldRow label="View Count" value={plex.viewCount} />
              <FieldRow label="Last Viewed" value={formatDate(plex.lastViewedAt)} />
              <FieldRow label="Added to Plex" value={formatDate(plex.addedAt)} />
              <div className="pt-1 mt-1 border-t border-slate-700/50">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Metadata</span>
              </div>
              <FieldRow label="Audience Rating" value={plex.audienceRating} />
              <FieldRow label="Content Rating" value={plex.contentRating} />
              <FieldRow label="Studio" value={plex.studio} />
              <FieldRow label="Duration" value={plex.duration ? `${Math.round((plex.duration as number) / 60000)} min` : null} />
              <FieldRow label="GUID" value={plex.guid} truncate />
              <div className="pt-1 mt-1 border-t border-slate-700/50">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Collections & Playlists</span>
              </div>
              <FieldRow label="Playlists" value={Array.isArray(plex.playlists) && plex.playlists.length > 0 ? (plex.playlists as string[]).join(', ') : null} />
            </>
          ) : (
            <div className="text-xs text-slate-500 py-2">
              Not found in Plex library. This may mean:
              <ul className="mt-1 ml-3 list-disc text-slate-600">
                <li>Not yet downloaded</li>
                <li>Different title in Plex</li>
                <li>Plex not configured</li>
              </ul>
            </div>
          )}
        </ServiceSection>

        {/* Tautulli Section */}
        <ServiceSection
          title="Tautulli"
          subtitle={tautulli ? "Connected" : "No data"}
          icon={<IconTautulli />}
          isExpanded={expandedSections.tautulli}
          onToggle={() => toggleSection('tautulli')}
          color={tautulli ? "purple" : "slate"}
          isEmpty={!tautulli}
        >
          {tautulli ? (
            <>
              <FieldRow label="Plex Rating Key" value={tautulli.plexRatingKey} />
              <div className="pt-1 mt-1 border-t border-slate-700/50">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Playback</span>
              </div>
              <FieldRow label="Play Count" value={tautulli.playCount} />
              <FieldRow label="Last Watched" value={formatDate(tautulli.lastWatchedAt)} />
              <FieldRow label="Added to Plex" value={formatDate(tautulli.addedAt)} />
              <div className="pt-1 mt-1 border-t border-slate-700/50">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">File Info</span>
              </div>
              <FieldRow label="File Size" value={formatBytes(tautulli.fileSize as number)} />
              <FieldRow label="File Path" value={tautulli.filePath} truncate />
              <FieldRow label="Duration" value={tautulli.duration ? `${tautulli.duration} min` : null} />
              <div className="pt-1 mt-1 border-t border-slate-700/50">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Quality</span>
              </div>
              <FieldRow label="Resolution" value={tautulli.resolution} />
              <FieldRow label="Video Codec" value={tautulli.videoCodec} />
              <FieldRow label="Audio Codec" value={tautulli.audioCodec} />
              <FieldRow label="Bitrate" value={tautulli.bitrate ? `${tautulli.bitrate} kbps` : null} />
              <FieldRow label="Container" value={tautulli.container} />
            </>
          ) : (
            <div className="text-xs text-slate-500 py-2">
              No Tautulli data available. This may mean:
              <ul className="mt-1 ml-3 list-disc text-slate-600">
                <li>Movie not in Plex library</li>
                <li>Tautulli not configured</li>
                <li>Title mismatch between services</li>
              </ul>
            </div>
          )}
        </ServiceSection>

        {/* Radarr Section (Movies) */}
        {item.mediaType === 'MOVIE' && (
          <ServiceSection
            title="Radarr"
            subtitle={radarr ? (radarr.hasFile ? "Has File" : "Missing") : "No data"}
            icon={<IconRadarr />}
            isExpanded={expandedSections.radarr}
            onToggle={() => toggleSection('radarr')}
            color={radarr?.hasFile ? "green" : "amber"}
            isEmpty={!radarr}
          >
            {radarr ? (
              <>
                <FieldRow label="Has File" value={radarr.hasFile ? 'Yes' : 'No'} highlight={!radarr.hasFile} />
                <FieldRow label="Monitored" value={radarr.monitored ? 'Yes' : 'No'} />
                <FieldRow label="Status" value={radarr.status} />
                <FieldRow label="TMDB Rating" value={radarr.tmdbRating} />
                <FieldRow label="Runtime" value={radarr.runtime ? `${radarr.runtime} min` : null} />
                <FieldRow label="Size on Disk" value={formatBytes(radarr.sizeOnDisk as number)} />
                <FieldRow label="Quality Profile" value={radarr.qualityProfileId} />
                <FieldRow label="Min. Availability" value={radarr.minimumAvailability} />
                <FieldRow label="Tags" value={Array.isArray(radarr.tags) ? radarr.tags.join(', ') : null} />
                <FieldRow label="Digital Release" value={formatDate(radarr.digitalRelease)} />
                <FieldRow label="In Cinemas" value={formatDate(radarr.inCinemas)} />
                <FieldRow label="Added to Radarr" value={formatDate(radarr.addedAt)} />
                <div className="pt-1 mt-1 border-t border-slate-700/50">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">External IDs</span>
                </div>
                <FieldRow label="TMDB ID" value={radarr.tmdbId} />
                <FieldRow label="IMDB ID" value={radarr.imdbId} />
              </>
            ) : (
              <div className="text-xs text-slate-500 py-2">No Radarr data available</div>
            )}
          </ServiceSection>
        )}

        {/* Sonarr Section (TV) */}
        {item.mediaType === 'TV_SERIES' && (
          <ServiceSection
            title="Sonarr"
            subtitle={sonarr ? `${sonarr.episodeFileCount}/${sonarr.totalEpisodeCount} eps` : "No data"}
            icon={<IconSonarr />}
            isExpanded={expandedSections.sonarr}
            onToggle={() => toggleSection('sonarr')}
            color={sonarr ? "blue" : "slate"}
            isEmpty={!sonarr}
          >
            {sonarr ? (
              <>
                <FieldRow label="Monitored" value={sonarr.monitored ? 'Yes' : 'No'} />
                <FieldRow label="Status" value={sonarr.status} />
                <FieldRow label="Series Type" value={sonarr.seriesType} />
                <FieldRow label="Network" value={sonarr.network} />
                <FieldRow label="Seasons" value={sonarr.seasonCount} />
                <FieldRow label="Total Episodes" value={sonarr.totalEpisodeCount} />
                <FieldRow label="Episode Files" value={sonarr.episodeFileCount} />
                <FieldRow label="Completion" value={sonarr.percentOfEpisodes ? `${Math.round(sonarr.percentOfEpisodes as number)}%` : null} />
                <FieldRow label="Size on Disk" value={formatBytes(sonarr.sizeOnDisk as number)} />
                <FieldRow label="Ended" value={sonarr.ended ? 'Yes' : 'No'} />
                <FieldRow label="First Aired" value={formatDate(sonarr.firstAired)} />
                <FieldRow label="Certification" value={sonarr.certification} />
                <FieldRow label="Quality Profile" value={sonarr.qualityProfileId} />
                <FieldRow label="Tags" value={Array.isArray(sonarr.tags) ? sonarr.tags.join(', ') : null} />
                <FieldRow label="Added to Sonarr" value={formatDate(sonarr.addedAt)} />
                <div className="pt-1 mt-1 border-t border-slate-700/50">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">External IDs</span>
                </div>
                <FieldRow label="TVDB ID" value={sonarr.tvdbId} />
                <FieldRow label="IMDB ID" value={sonarr.imdbId} />
              </>
            ) : (
              <div className="text-xs text-slate-500 py-2">No Sonarr data available</div>
            )}
          </ServiceSection>
        )}

        {/* Overseerr Section */}
        <ServiceSection
          title="Overseerr"
          subtitle={overseerr ? (overseerr.hasRequest ? "Requested" : overseerr.status as string) : "No data"}
          icon={<IconOverseerr />}
          isExpanded={expandedSections.overseerr}
          onToggle={() => toggleSection('overseerr')}
          color={overseerr?.hasRequest ? "orange" : "slate"}
          isEmpty={!overseerr}
        >
          {overseerr ? (
            <>
              <FieldRow label="Media Status" value={overseerr.status} />
              <FieldRow label="Status Code" value={overseerr.mediaStatus} />
              <FieldRow label="Has Request" value={overseerr.hasRequest ? 'Yes' : 'No'} />
              <FieldRow label="Request Count" value={overseerr.requestCount} />
              <FieldRow label="Requested By" value={overseerr.requestedBy} />
              <FieldRow label="Requested At" value={formatDate(overseerr.requestedAt)} />
              <FieldRow label="TMDB ID" value={overseerr.tmdbId} />
            </>
          ) : (
            <div className="text-xs text-slate-500 py-2">
              No Overseerr data available. This may mean:
              <ul className="mt-1 ml-3 list-disc text-slate-600">
                <li>No TMDB ID for this item</li>
                <li>Overseerr not configured</li>
                <li>Not in Overseerr database</li>
              </ul>
            </div>
          )}
        </ServiceSection>
      </div>
    </div>
  )
}

// Service Section Component
interface ServiceSectionProps {
  title: string
  subtitle?: string
  icon: React.ReactNode
  isExpanded: boolean
  onToggle: () => void
  color: 'cyan' | 'purple' | 'green' | 'amber' | 'blue' | 'orange' | 'slate'
  isEmpty?: boolean
  children: React.ReactNode
}

function ServiceSection({ title, subtitle, icon, isExpanded, onToggle, color, isEmpty, children }: ServiceSectionProps) {
  const colorClasses = {
    cyan: 'border-cyan-500/30 bg-cyan-500/5',
    purple: 'border-purple-500/30 bg-purple-500/5',
    green: 'border-green-500/30 bg-green-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
    blue: 'border-blue-500/30 bg-blue-500/5',
    orange: 'border-orange-500/30 bg-orange-500/5',
    slate: 'border-slate-600/30 bg-slate-800/30',
  }

  const iconColors = {
    cyan: 'text-cyan-400',
    purple: 'text-purple-400',
    green: 'text-green-400',
    amber: 'text-amber-400',
    blue: 'text-blue-400',
    orange: 'text-orange-400',
    slate: 'text-slate-500',
  }

  return (
    <div className={`border rounded-lg overflow-hidden ${colorClasses[color]}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-2.5 hover:bg-slate-800/30 transition-colors"
      >
        <span className={iconColors[color]}>{icon}</span>
        <span className="text-sm font-medium text-slate-200 flex-1 text-left">{title}</span>
        {subtitle && (
          <span className={`text-xs ${isEmpty ? 'text-slate-500' : 'text-slate-400'}`}>
            {subtitle}
          </span>
        )}
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-2.5 pb-2.5 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  )
}

// Field Row Component
interface FieldRowProps {
  label: string
  value: unknown
  truncate?: boolean
  highlight?: boolean
}

function FieldRow({ label, value, truncate, highlight }: FieldRowProps) {
  const [copied, setCopied] = useState(false)
  const isNull = value === null || value === undefined || value === ''
  const displayValue = isNull ? 'null' : String(value)

  const handleCopy = () => {
    if (!isNull) {
      navigator.clipboard.writeText(displayValue)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div className="flex items-center justify-between py-1 px-1 rounded hover:bg-slate-800/30 group">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <span
          className={`text-xs font-mono ${
            isNull
              ? 'text-slate-600 italic'
              : highlight
                ? 'text-amber-400'
                : 'text-slate-300'
          } ${truncate ? 'max-w-[120px] truncate' : ''}`}
          title={truncate ? displayValue : undefined}
        >
          {displayValue}
        </span>
        {!isNull && (
          <button
            type="button"
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-cyan-400"
            title="Copy"
          >
            {copied ? (
              <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// Helper: Format date
function formatDate(value: unknown): string | null {
  if (!value) return null
  try {
    const date = value instanceof Date ? value : new Date(value as string)
    return date.toLocaleDateString()
  } catch {
    return null
  }
}

// Helper: Format bytes
function formatBytes(bytes: number | null | undefined): string | null {
  if (!bytes || bytes === 0) return null
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

// Icons
function IconInfo() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function IconTautulli() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}

function IconRadarr() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
    </svg>
  )
}

function IconSonarr() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

function IconOverseerr() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )
}

function IconPlex() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
