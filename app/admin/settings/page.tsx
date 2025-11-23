import { getAdminSettings } from "@/actions/admin"
import { LLMProviderForm, LLMToggle, ServerForm } from "@/components/admin/settings/settings-edit-forms"
import { getBaseUrl } from "@/lib/utils"

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const settings = await getAdminSettings()
  const baseUrl = getBaseUrl()
  const nodeVersion = process.version
  const nodeEnv = process.env.NODE_ENV || "development"

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
                    <div className="text-sm text-white">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        nodeEnv === "production"
                          ? "bg-green-500/20 text-green-400 border border-green-500/30"
                          : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                      }`}>
                        {nodeEnv.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-1">Node.js Version</div>
                    <div className="text-sm text-white font-mono">{nodeVersion}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-1">LLM Status</div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        settings.config.llmDisabled
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : "bg-green-500/20 text-green-400 border border-green-500/30"
                      }`}>
                        {settings.config.llmDisabled ? "Disabled" : "Enabled"}
                      </span>
                      <LLMToggle disabled={settings.config.llmDisabled} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* LLM Configuration */}
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  LLM Configuration
                </h2>
                <p className="text-xs text-slate-400 mt-1">AI provider and model settings</p>
              </div>
              <div className="p-4">
                <LLMProviderForm provider={settings.llmProvider} />
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
                    {settings.plexServer ? (
                      <span className="px-2 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded text-xs font-medium">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-slate-700/50 text-slate-400 border border-slate-600 rounded text-xs font-medium">
                        Not Configured
                      </span>
                    )}
                  </div>
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
                    {settings.tautulli ? (
                      <span className="px-2 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded text-xs font-medium">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-slate-700/50 text-slate-400 border border-slate-600 rounded text-xs font-medium">
                        Not Configured
                      </span>
                    )}
                  </div>
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
                    {settings.overseerr ? (
                      <span className="px-2 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded text-xs font-medium">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-slate-700/50 text-slate-400 border border-slate-600 rounded text-xs font-medium">
                        Not Configured
                      </span>
                    )}
                  </div>
                  <ServerForm type="overseerr" server={settings.overseerr} />
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
                    <div className="text-sm text-white">SQLite</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-1">Database URL</div>
                    <div className="text-sm text-slate-400 font-mono text-xs truncate">
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

