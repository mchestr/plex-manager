import { getAdminSettings } from "@/actions/admin"
import { DiscordIntegrationForm, LLMProviderForm, LLMToggle, ServerForm } from "@/components/admin/settings/settings-edit-forms"
import { WrappedSettingsForm } from "@/components/admin/settings/wrapped-settings-form"
import { getBaseUrl } from "@/lib/utils"

export const dynamic = 'force-dynamic'

type BadgeTone = "success" | "warning" | "danger" | "neutral"

type StatusBadgeProps = {
  label: string
  tone?: BadgeTone
  tooltip?: string
}

const toneClasses: Record<BadgeTone, string> = {
  success: "bg-green-500/15 text-green-300 border border-green-500/30",
  warning: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  danger: "bg-red-500/15 text-red-300 border border-red-500/30",
  neutral: "bg-slate-800/60 text-slate-300 border border-slate-600/70",
}

function StatusBadge({ label, tone = "neutral", tooltip }: StatusBadgeProps) {
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-medium tracking-wide ${toneClasses[tone]}`}
      aria-label={tooltip ?? label}
      title={tooltip ?? label}
    >
      {label}
    </span>
  )
}

type FeatureStatusBadgeProps = {
  featureName: string
  enabled: boolean
}

function FeatureStatusBadge({ featureName, enabled }: FeatureStatusBadgeProps) {
  const label = enabled ? "Feature Enabled" : "Feature Disabled"
  const tooltip = `${featureName} ${label}`
  return (
    <StatusBadge
      label={label}
      tone={enabled ? "success" : "neutral"}
      tooltip={tooltip}
    />
  )
}

export default async function SettingsPage() {
  const settings = await getAdminSettings()
  const baseUrl = getBaseUrl()
  const discordPortalUrl = `${baseUrl}/discord/link`
  const nodeVersion = process.version
  const nodeEnv = process.env.NODE_ENV || "development"
  const databaseProvider = (() => {
    const url = process.env.DATABASE_URL
    if (!url) return "Not configured"
    if (url.startsWith("postgres")) return "PostgreSQL"
    if (url.startsWith("file:") || url.startsWith("sqlite:")) return "SQLite"
    return "Unknown"
  })()

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Settings</h1>
            <p className="text-sm text-slate-400">
              Manage application configuration and system settings
            </p>
          </div>

          <div className="space-y-6">
            {/* Application Settings */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Application Settings
                </h2>
                <p className="text-xs text-slate-400 mt-1">Core application configuration</p>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-1">Base URL</div>
                    <div className="text-sm text-white font-mono">{baseUrl}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-1">Environment</div>
                    <StatusBadge
                      label={nodeEnv.toUpperCase()}
                      tone={nodeEnv === "production" ? "success" : "warning"}
                      tooltip={`Environment: ${nodeEnv}`}
                    />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-1">Node.js Version</div>
                    <div className="text-sm text-white font-mono">{nodeVersion}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* LLM Configuration */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                      <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      LLM Configuration
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">AI provider and model settings for chat assistant and wrapped generation</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <FeatureStatusBadge
                      featureName="LLM"
                      enabled={!settings.config.llmDisabled}
                    />
                    <LLMToggle disabled={settings.config.llmDisabled} />
                  </div>
                </div>
              </div>
              <div className="p-4 space-y-6">
                {/* Chat Assistant Configuration */}
                <div className="border border-slate-700 rounded-lg p-4">
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      Chat Assistant
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">Configuration for the admin troubleshooting chatbot</p>
                  </div>
                  <LLMProviderForm
                    provider={settings.chatLLMProvider}
                    purpose="chat"
                  />
                </div>

                {/* Wrapped Generation Configuration */}
                <div className="border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Wrapped Generation
                    </h3>
                    <FeatureStatusBadge
                      featureName="Plex Wrapped"
                      enabled={settings.config.wrappedEnabled ?? true}
                    />
                  </div>
                  <div className="space-y-4">
                    <WrappedSettingsForm
                      enabled={settings.config.wrappedEnabled ?? true}
                      year={settings.config.wrappedGenerationStartDate
                        ? new Date(settings.config.wrappedGenerationStartDate).getFullYear()
                        : new Date().getFullYear()}
                      startDate={settings.config.wrappedGenerationStartDate}
                      endDate={settings.config.wrappedGenerationEndDate}
                    />
                    <div className="pt-4 border-t border-slate-700">
                      <LLMProviderForm
                        provider={settings.wrappedLLMProvider}
                        purpose="wrapped"
                      />
                    </div>
                  </div>
                </div>

                {/* Discord Configuration */}
                <div className="border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.582.074.074 0 0 1 .06-.053c.05-.025.1-.051.151-.075a.075.075 0 0 1 .079.007c.04.03.08.062.116.098a.077.077 0 0 1 .021.075c-.016.03-.036.06-.054.089a.074.074 0 0 1-.041.034c-.05.012-.102.023-.152.033a.077.077 0 0 0-.058.043c-.047.105-.09.212-.13.321a.076.076 0 0 0 .021.08c.49.49 1.043.905 1.66 1.226a.077.077 0 0 0 .084-.01c.405-.363.765-.77 1.076-1.214a.074.074 0 0 0-.041-.11c-.61-.227-1.19-.52-1.733-.874a.077.077 0 0 1-.007-.128c.12-.09.246-.174.38-.253a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.134.08.26.163.38.253a.077.077 0 0 1-.006.127c-.543.355-1.123.648-1.733.875a.076.076 0 0 0-.041.11c.31.443.67.85 1.075 1.214a.077.077 0 0 0 .084.01c.617-.32 1.17-.736 1.66-1.226a.076.076 0 0 0 .022-.08c-.04-.11-.083-.217-.13-.322a.077.077 0 0 0-.057-.043c-.05-.01-.102-.02-.152-.033a.074.074 0 0 1-.041-.034c-.019-.03-.038-.06-.054-.09a.077.077 0 0 1 .021-.075c.036-.036.075-.068.116-.098a.075.075 0 0 1 .079-.007c.05.024.1.05.151.075a.074.074 0 0 1 .06.053c.026.033.057.063.085.095a.073.073 0 0 1 .026.063.076.076 0 0 1-.021.086c-.025.03-.051.06-.08.087a.08.08 0 0 1-.079.028 13.105 13.105 0 0 1-1.874.892.077.077 0 0 0-.041.107c.35.698.764 1.362 1.226 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                      </svg>
                      Discord
                    </h3>
                    <FeatureStatusBadge
                      featureName="Discord"
                      enabled={Boolean(settings.discordIntegration?.isEnabled)}
                    />
                  </div>
                  <DiscordIntegrationForm
                    integration={settings.discordIntegration}
                    linkedCount={settings.discordLinkedCount}
                    portalUrl={discordPortalUrl}
                  />
                </div>
              </div>
            </div>

            {/* Server Configuration */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                  </svg>
                  Server Configuration
                </h2>
                <p className="text-xs text-slate-400 mt-1">Connected media server integrations</p>
              </div>
              <div className="p-4 space-y-4">
                {/* Plex Server */}
                <div className="border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <svg className="w-4 h-4 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-11V7h2v4h4v2h-4v4h-2v-4H7v-2h4z"/>
                      </svg>
                      Plex Server
                    </h3>
                    <FeatureStatusBadge
                      featureName="Plex integration"
                      enabled={Boolean(settings.plexServer)}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    Core media server for authentication and library access (required)
                  </p>
                  <ServerForm type="plex" server={settings.plexServer} />
                </div>

                {/* Tautulli */}
                <div className="border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      Tautulli
                    </h3>
                    <FeatureStatusBadge
                      featureName="Tautulli integration"
                      enabled={Boolean(settings.tautulli)}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    Plex monitoring and analytics - provides watch history and statistics for Wrapped generation
                  </p>
                  <ServerForm type="tautulli" server={settings.tautulli} />
                </div>

                {/* Overseerr */}
                <div className="border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      Overseerr
                    </h3>
                    <FeatureStatusBadge
                      featureName="Overseerr integration"
                      enabled={Boolean(settings.overseerr)}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    Media request management - displays request button on user dashboard
                  </p>
                  <ServerForm type="overseerr" server={settings.overseerr} />
                </div>

                {/* Sonarr */}
                <div className="border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Sonarr
                    </h3>
                    <FeatureStatusBadge
                      featureName="Sonarr integration"
                      enabled={Boolean(settings.sonarr)}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    TV show library management - displays series library and viewing statistics
                  </p>
                  <ServerForm type="sonarr" server={settings.sonarr} />
                </div>

                {/* Radarr */}
                <div className="border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Radarr
                    </h3>
                    <FeatureStatusBadge
                      featureName="Radarr integration"
                      enabled={Boolean(settings.radarr)}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    Movie library management - displays movie library and viewing statistics
                  </p>
                  <ServerForm type="radarr" server={settings.radarr} />
                </div>

                {/* Prometheus Status */}
                <div className="border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2.18c5.423 0 9.82 4.397 9.82 9.82 0 5.423-4.397 9.82-9.82 9.82-5.423 0-9.82-4.397-9.82-9.82 0-5.423 4.397-9.82 9.82-9.82zm0 1.64c-4.516 0-8.18 3.664-8.18 8.18 0 4.516 3.664 8.18 8.18 8.18 4.516 0 8.18-3.664 8.18-8.18 0-4.516-3.664-8.18-8.18-8.18zm0 2.454c3.163 0 5.727 2.564 5.727 5.726 0 3.163-2.564 5.727-5.727 5.727S6.273 15.163 6.273 12c0-3.162 2.564-5.726 5.727-5.726z"/>
                      </svg>
                      Prometheus Status
                    </h3>
                    <FeatureStatusBadge
                      featureName="Prometheus status monitoring"
                      enabled={Boolean(settings.prometheus)}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    Display a status footer bar showing service uptime over the last 7 days (168 hourly segments)
                  </p>
                  <ServerForm type="prometheus" server={settings.prometheus} />
                </div>
              </div>
            </div>

            {/* System Information */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  System Information
                </h2>
                <p className="text-xs text-slate-400 mt-1">Runtime and database information</p>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-1">Database Provider</div>
                    <div className="text-sm text-white">{databaseProvider}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-1">Database URL</div>
                    <div className="text-xs text-slate-400 font-mono truncate">
                      {process.env.DATABASE_URL?.replace(/\/\/.*@/, "//***@") || "Not configured"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-1">Last Config Update</div>
                    <div className="text-sm text-slate-300">
                      {settings.config.updatedAt
                        ? new Date(settings.config.updatedAt).toLocaleString()
                        : "Never"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-1">Platform</div>
                    <div className="text-sm text-white">
                      {process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : process.platform === "linux" ? "Linux" : process.platform}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
      </div>
    </div>
  )
}

