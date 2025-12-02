"use client"

import { createMaintenanceRule, updateMaintenanceRule } from "@/actions/maintenance"
import { EnhancedRuleBuilder, createDefaultCriteria } from "@/components/maintenance/enhanced-rule-builder"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
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
import { MediaBrowser } from "@/components/maintenance/MediaBrowser"
import { RulePreviewPanel } from "@/components/maintenance/RulePreviewPanel"
import { DataInspector } from "@/components/maintenance/DataInspector"
import type { MediaItem } from "@/lib/maintenance/rule-evaluator"

export interface MaintenanceRuleData {
  id?: string
  name: string
  description?: string | null
  enabled: boolean
  mediaType: MediaType
  criteria: RuleCriteria
  actionType: ActionType
  actionDelayDays?: number | null
  radarrId?: string | null
  sonarrId?: string | null
  schedule?: string | null
}

interface RuleFormProps {
  /** Mode of the form */
  mode: "create" | "edit"
  /** Initial data for edit mode */
  initialData?: MaintenanceRuleData
  /** Callback after successful save */
  onSuccess?: () => void
}

export function RuleForm({ mode, initialData, onSuccess }: RuleFormProps) {
  const toast = useToast()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state - initialize from initialData if provided
  const [name, setName] = useState(initialData?.name ?? "")
  const [description, setDescription] = useState(initialData?.description ?? "")
  const [enabled, setEnabled] = useState(initialData?.enabled ?? true)
  const [mediaType, setMediaType] = useState<MediaType>(initialData?.mediaType ?? "MOVIE")
  const [actionType, setActionType] = useState<ActionType>(initialData?.actionType ?? "FLAG_FOR_REVIEW")
  const [actionDelayDays, setActionDelayDays] = useState<number | undefined>(
    initialData?.actionDelayDays ?? undefined
  )
  const [radarrId, setRadarrId] = useState<string | undefined>(initialData?.radarrId ?? undefined)
  const [sonarrId, setSonarrId] = useState<string | undefined>(initialData?.sonarrId ?? undefined)
  const [schedule, setSchedule] = useState(initialData?.schedule ?? "")

  // Criteria state - start with initial data or default
  const [criteria, setCriteria] = useState<RuleCriteria>(
    () => initialData?.criteria ?? createDefaultCriteria(initialData?.mediaType ?? "MOVIE")
  )

  // Media preview state
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [previewTab, setPreviewTab] = useState<'preview' | 'inspector'>('preview')

  // Fetch Radarr servers
  const { data: radarrData, isLoading: radarrLoading, error: radarrError } = useQuery({
    queryKey: ['admin', 'maintenance', 'radarr-servers'],
    queryFn: async () => {
      const response = await fetch('/api/admin/radarr')
      if (!response.ok) throw new Error('Failed to fetch Radarr servers')
      const data = await response.json()
      return radarrServerListSchema.parse(data)
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    retryDelay: 1000,
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
    staleTime: 5 * 60 * 1000,
    retry: 1,
    retryDelay: 1000,
  })

  // Handle Radarr fetch errors
  useEffect(() => {
    if (radarrError) {
      toast.showError(`Failed to load Radarr servers: ${radarrError instanceof Error ? radarrError.message : 'Unknown error'}`)
    }
  }, [radarrError, toast])

  // Handle Sonarr fetch errors
  useEffect(() => {
    if (sonarrError) {
      toast.showError(`Failed to load Sonarr servers: ${sonarrError instanceof Error ? sonarrError.message : 'Unknown error'}`)
    }
  }, [sonarrError, toast])

  const radarrServers = radarrData?.servers || []
  const sonarrServers = sonarrData?.servers || []

  // Update criteria when media type changes (only in create mode)
  const handleMediaTypeChange = (newMediaType: MediaType) => {
    setMediaType(newMediaType)
    if (mode === "create") {
      setCriteria(createDefaultCriteria(newMediaType))
    }
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
      const ruleData = {
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
      }

      const result = mode === "create"
        ? await createMaintenanceRule(ruleData)
        : await updateMaintenanceRule(initialData!.id!, ruleData)

      if (result.success) {
        toast.showSuccess(mode === "create" ? "Maintenance rule created successfully" : "Maintenance rule updated successfully")
        if (onSuccess) {
          onSuccess()
        } else {
          router.push("/admin/maintenance/rules")
        }
      } else {
        toast.showError(result.error || `Failed to ${mode} rule`)
      }
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : `Failed to ${mode} rule`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative">
      {/* Main Form - Full Width */}
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
                  Enable rule {mode === "create" ? "immediately" : ""}
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
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
            className="flex-1"
            data-testid="maintenance-rule-cancel"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            className="flex-1"
            data-testid="maintenance-rule-submit"
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner size="sm" label={mode === "create" ? "Creating rule" : "Saving rule"} className="text-white" />
                {mode === "create" ? "Creating..." : "Saving..."}
              </>
            ) : (
              mode === "create" ? "Create Rule" : "Save Changes"
            )}
          </Button>
        </div>
      </form>

      {/* Floating Test Rule Button - positioned to avoid AI assistant button */}
      <button
        type="button"
        onClick={() => setShowPreview(true)}
        className={`fixed bottom-6 right-24 flex items-center gap-2 px-4 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-full shadow-lg transition-all z-40 ${
          showPreview ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        data-testid="rule-preview-toggle"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <span className="font-medium">Test Rule</span>
      </button>

      {/* Slide-out Drawer */}
      {showPreview && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowPreview(false)}
          />

          {/* Drawer Panel */}
          <div className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-slate-900 border-l border-slate-700 z-50 overflow-y-auto animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Test Rule</h2>
                <p className="text-sm text-slate-400">
                  Select media to see real-time evaluation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Drawer Content */}
            <div className="p-4 space-y-4">
              {/* Media Browser */}
              <MediaBrowser
                mediaType={mediaType}
                selectedItem={selectedMedia}
                onSelectItem={setSelectedMedia}
                criteria={criteria}
              />

              {/* Tabs for Preview / Inspector */}
              <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPreviewTab('preview')}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    previewTab === 'preview'
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                  data-testid="rule-preview-tab"
                >
                  Rule Preview
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('inspector')}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    previewTab === 'inspector'
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                  data-testid="data-inspector-tab"
                >
                  Data Inspector
                </button>
              </div>

              {/* Preview/Inspector Content */}
              {previewTab === 'preview' ? (
                <RulePreviewPanel
                  criteria={criteria}
                  selectedItem={selectedMedia}
                />
              ) : (
                <DataInspector item={selectedMedia} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
