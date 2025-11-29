"use client"

import { createMaintenanceRule } from "@/actions/maintenance"
import { EnhancedRuleBuilder, createDefaultCriteria } from "@/components/maintenance/enhanced-rule-builder"
import { StyledDropdown } from "@/components/ui/styled-dropdown"
import { StyledInput } from "@/components/ui/styled-input"
import { StyledTextarea } from "@/components/ui/styled-textarea"
import { useToast } from "@/components/ui/toast"
import type { ActionType, MediaType, RuleCriteria } from "@/lib/validations/maintenance"
import { radarrServerListSchema } from "@/lib/validations/radarr"
import { sonarrServerListSchema } from "@/lib/validations/sonarr"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"

export default function NewRulePage() {
  const toast = useToast()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [enabled, setEnabled] = useState(true)
  const [mediaType, setMediaType] = useState<MediaType>("MOVIE")
  const [actionType, setActionType] = useState<ActionType>("FLAG_FOR_REVIEW")
  const [actionDelayDays, setActionDelayDays] = useState<number | undefined>(undefined)
  const [radarrId, setRadarrId] = useState<string | undefined>(undefined)
  const [sonarrId, setSonarrId] = useState<string | undefined>(undefined)
  const [schedule, setSchedule] = useState("")

  // Criteria state - start with default hierarchical structure
  const [criteria, setCriteria] = useState<RuleCriteria>(() => createDefaultCriteria("MOVIE"))

  // Fetch Radarr servers
  const { data: radarrData, isLoading: radarrLoading, error: radarrError } = useQuery({
    queryKey: ['admin', 'maintenance', 'radarr-servers'],
    queryFn: async () => {
      const response = await fetch('/api/admin/radarr')
      if (!response.ok) throw new Error('Failed to fetch Radarr servers')
      const data = await response.json()
      return radarrServerListSchema.parse(data)
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - server lists don't change often
    retry: 1, // Only retry once to avoid overwhelming the server
    retryDelay: 1000, // Wait 1 second before retrying
  })

  // Fetch Sonarr servers
  const { data: sonarrData, isLoading: sonarrLoading, error: sonarrError } = useQuery({
    queryKey: ['admin', 'maintenance', 'sonarr-servers'],
    queryFn: async () => {
      const response = await fetch('/api/admin/sonarr')
      if (!response.ok) throw new Error('Failed to fetch Sonarr servers')
      const data = await response.json()
      return sonarrServerListSchema.parse(data)
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - server lists don't change often
    retry: 1, // Only retry once to avoid overwhelming the server
    retryDelay: 1000, // Wait 1 second before retrying
  })

  // Handle Radarr fetch errors
  useEffect(() => {
    if (radarrError) {
      toast.showError(`Failed to load Radarr servers: ${radarrError instanceof Error ? radarrError.message : 'Unknown error'}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radarrError])

  // Handle Sonarr fetch errors
  useEffect(() => {
    if (sonarrError) {
      toast.showError(`Failed to load Sonarr servers: ${sonarrError instanceof Error ? sonarrError.message : 'Unknown error'}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sonarrError])

  const radarrServers = radarrData?.servers || []
  const sonarrServers = sonarrData?.servers || []

  // Update criteria when media type changes
  const handleMediaTypeChange = (newMediaType: MediaType) => {
    setMediaType(newMediaType)
    setCriteria(createDefaultCriteria(newMediaType))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.showError("Rule name is required")
      return
    }

    // Validate criteria has at least one condition
    if (!criteria.conditions || criteria.conditions.length === 0) {
      toast.showError("At least one condition is required")
      return
    }

    setIsSubmitting(true)

    try {
      const result = await createMaintenanceRule({
        name: name.trim(),
        description: description.trim() || undefined,
        enabled,
        mediaType,
        criteria,
        actionType,
        actionDelayDays,
        radarrId,
        sonarrId,
        schedule: schedule.trim() || undefined,
      })

      if (result.success) {
        toast.showSuccess("Maintenance rule created successfully")
        router.push("/admin/maintenance/rules")
      } else {
        toast.showError(result.error || "Failed to create rule")
      }
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Failed to create rule")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">Create Maintenance Rule</h1>
          <p className="text-slate-400">Define powerful criteria for automated library maintenance</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Basic Information</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-400 mb-2">
                  Rule Name <span className="text-red-400">*</span>
                </label>
                <StyledInput
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Remove unwatched movies older than 6 months"
                  required
                  data-testid="maintenance-rule-name-input"
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-slate-400 mb-2">
                  Description
                </label>
                <StyledTextarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Optional description of what this rule does"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="mediaType" className="block text-sm font-medium text-slate-400 mb-2">
                    Media Type
                  </label>
                  <StyledDropdown
                    id="mediaType"
                    value={mediaType}
                    onChange={(value) => handleMediaTypeChange(value as MediaType)}
                    options={[
                      { value: "MOVIE", label: "Movie" },
                      { value: "TV_SERIES", label: "TV Series" },
                      { value: "EPISODE", label: "Episode" },
                    ]}
                    size="md"
                    data-testid="maintenance-rule-media-type-select"
                  />
                </div>

                <div>
                  <label htmlFor="actionType" className="block text-sm font-medium text-slate-400 mb-2">
                    Action Type
                  </label>
                  <StyledDropdown
                    id="actionType"
                    value={actionType}
                    onChange={(value) => setActionType(value as ActionType)}
                    options={[
                      { value: "FLAG_FOR_REVIEW", label: "Flag for Review" },
                      { value: "AUTO_DELETE", label: "Auto Delete" },
                      { value: "UNMONITOR_AND_DELETE", label: "Unmonitor & Delete" },
                      { value: "UNMONITOR_AND_KEEP", label: "Unmonitor & Keep Files" },
                      { value: "DO_NOTHING", label: "Report Only (No Action)" },
                    ]}
                    size="md"
                    data-testid="maintenance-rule-action-type-select"
                  />
                </div>
              </div>

              {/* Action delay */}
              <div>
                <label htmlFor="actionDelayDays" className="block text-sm font-medium text-slate-400 mb-2">
                  Action Delay (Optional)
                </label>
                <StyledInput
                  id="actionDelayDays"
                  type="number"
                  min="0"
                  value={actionDelayDays ?? ""}
                  onChange={(e) => setActionDelayDays(e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="0"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Number of days to wait before executing the action. Leave empty for immediate action.
                </p>
              </div>

              {/* Server instance selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {mediaType === "MOVIE" && (
                  <div>
                    <label htmlFor="radarrId" className="block text-sm font-medium text-slate-400 mb-2">
                      Radarr Server (Optional)
                    </label>
                    {radarrLoading ? (
                      <div className="w-full bg-slate-800/50 border border-slate-600 rounded-lg px-4 py-2 text-slate-400">
                        Loading servers...
                      </div>
                    ) : (
                      <StyledDropdown
                        id="radarrId"
                        value={radarrId ?? ""}
                        onChange={(value) => setRadarrId(value || undefined)}
                        options={
                          radarrServers.length > 0
                            ? [
                                { value: "", label: "Use active server" },
                                ...radarrServers.map(s => ({ value: s.id, label: s.name }))
                              ]
                            : [{ value: "", label: "No servers configured" }]
                        }
                        size="md"
                        disabled={radarrServers.length === 0}
                      />
                    )}
                    <p className="text-xs text-slate-500 mt-1">
                      {radarrServers.length > 0
                        ? "Defaults to the active Radarr instance if not specified."
                        : "Configure a Radarr server in settings to enable this option."}
                    </p>
                  </div>
                )}

                {(mediaType === "TV_SERIES" || mediaType === "EPISODE") && (
                  <div>
                    <label htmlFor="sonarrId" className="block text-sm font-medium text-slate-400 mb-2">
                      Sonarr Server (Optional)
                    </label>
                    {sonarrLoading ? (
                      <div className="w-full bg-slate-800/50 border border-slate-600 rounded-lg px-4 py-2 text-slate-400">
                        Loading servers...
                      </div>
                    ) : (
                      <StyledDropdown
                        id="sonarrId"
                        value={sonarrId ?? ""}
                        onChange={(value) => setSonarrId(value || undefined)}
                        options={
                          sonarrServers.length > 0
                            ? [
                                { value: "", label: "Use active server" },
                                ...sonarrServers.map(s => ({ value: s.id, label: s.name }))
                              ]
                            : [{ value: "", label: "No servers configured" }]
                        }
                        size="md"
                        disabled={sonarrServers.length === 0}
                      />
                    )}
                    <p className="text-xs text-slate-500 mt-1">
                      {sonarrServers.length > 0
                        ? "Defaults to the active Sonarr instance if not specified."
                        : "Configure a Sonarr server in settings to enable this option."}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="rounded border-slate-600 text-cyan-600 focus:ring-cyan-500"
                  />
                  <span className="text-sm font-medium text-slate-400">
                    Enable rule immediately
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Enhanced Rule Builder */}
          <EnhancedRuleBuilder
            value={criteria}
            onChange={setCriteria}
            mediaType={mediaType}
          />

          {/* Schedule (Optional) */}
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Schedule (Optional)</h2>
            <div>
              <label htmlFor="schedule" className="block text-sm font-medium text-slate-400 mb-2">
                Cron Expression
              </label>
              <StyledInput
                id="schedule"
                type="text"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="0 2 * * * (2 AM daily)"
              />
              <p className="text-xs text-slate-500 mt-1">
                Leave empty to disable automatic scheduling. Use cron format for scheduled scans.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              data-testid="maintenance-rule-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              data-testid="maintenance-rule-submit"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating...
                </>
              ) : (
                "Create Rule"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
