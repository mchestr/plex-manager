"use client"

import { StyledDropdown } from "@/components/ui/select"
import { StyledInput } from "@/components/ui/input"
import { WrappedStatistics } from "@/types/wrapped"
import { StatisticsViewer } from "@/components/admin/playground/statistics-viewer"

interface PlexUser {
  id: string
  name: string
  email?: string
  thumb?: string
  restricted: boolean
  serverAdmin: boolean
}

interface TestConfigurationProps {
  testConfig: {
    userName: string
    year: number
    model: string
    temperature?: number
    maxTokens?: number
  }
  onTestConfigChange: (config: Partial<TestConfigurationProps["testConfig"]>) => void
  plexUsers: PlexUser[]
  loadingUsers: boolean
  models: string[]
  loadingModels: boolean
  configuredModel: string
  useCustomModel: boolean
  onUseCustomModelChange: (useCustom: boolean) => void
  statistics: WrappedStatistics | null
  loadingStatistics: boolean
  statisticsError: string | null
  showStatistics: boolean
  onShowStatisticsChange: (show: boolean) => void
  statisticsViewMode: "formatted" | "json"
  onStatisticsViewModeChange: (mode: "formatted" | "json") => void
  showAIParameters: boolean
  onShowAIParametersChange: (show: boolean) => void
  onRenderTemplate: () => void
  onGenerateResponse: () => void
  isPending: boolean
  costEstimate?: {
    promptTokens: number
    estimatedCompletionTokens: number
    totalTokens: number
    cost: number
    model: string
  }
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cost: number
  }
  selectedModel?: string
  onReset: () => void
}

export function TestConfiguration({
  testConfig,
  onTestConfigChange,
  plexUsers,
  loadingUsers,
  models,
  loadingModels,
  configuredModel,
  useCustomModel,
  onUseCustomModelChange,
  statistics,
  loadingStatistics,
  statisticsError,
  showStatistics,
  onShowStatisticsChange,
  statisticsViewMode,
  onStatisticsViewModeChange,
  showAIParameters,
  onShowAIParametersChange,
  onRenderTemplate,
  onGenerateResponse,
  isPending,
  costEstimate,
  tokenUsage,
  selectedModel,
  onReset,
}: TestConfigurationProps) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 shadow-lg shadow-slate-900/20">
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
              <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Test Configuration
            </h2>
            <p className="text-xs text-slate-400 mt-1">Configure user, year, and AI parameters for testing</p>
          </div>
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-red-400 transition-colors border border-slate-700 hover:border-red-500/50 rounded-lg hover:bg-red-500/5"
            title="Reset all playground state and reload"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            User Name
          </label>
          {loadingUsers ? (
            <div className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-400">
              Loading users...
            </div>
          ) : (
            <StyledDropdown
              value={testConfig.userName}
              onChange={(value) => onTestConfigChange({ userName: value })}
              options={plexUsers.map((user) => ({
                value: user.name,
                label: `${user.name}${user.email ? ` (${user.email})` : ""}${
                  user.serverAdmin ? " [Admin]" : ""
                }`,
              }))}
              placeholder="Select a user"
              size="md"
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Year
          </label>
          <StyledInput
            type="number"
            value={testConfig.year}
            onChange={(e) =>
              onTestConfigChange({
                year: parseInt(e.target.value) || new Date().getFullYear(),
              })
            }
            size="md"
          />
        </div>
      </div>

      {/* AI Parameters - Collapsible Section */}
      <div className="mt-6 pt-6 border-t border-slate-700/50">
        <button
          type="button"
          onClick={() => onShowAIParametersChange(!showAIParameters)}
          className="w-full flex items-center justify-between text-sm font-medium text-slate-300 hover:text-white transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-cyan-400"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 0L14.5 8.5L23 11L14.5 13.5L12 22L9.5 13.5L1 11L9.5 8.5L12 0Z" />
              <path d="M5 3L5.5 5.5L8 6L5.5 6.5L5 9L4.5 6.5L2 6L4.5 5.5L5 3Z" />
              <path d="M19 17L19.5 19.5L22 20L19.5 20.5L19 23L18.5 20.5L16 20L18.5 19.5L19 17Z" />
            </svg>
            <span>AI Parameters</span>
            <span className="text-xs text-slate-400 font-normal">(for Generate Response)</span>
          </div>
          <svg
            className={`w-4 h-4 transition-transform ${showAIParameters ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showAIParameters && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Model <span className="text-xs text-slate-400 font-normal">(optional)</span>
              </label>
              {loadingModels ? (
                <div className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-lg text-sm text-slate-400 shadow-sm">
                  Loading models...
                </div>
              ) : !useCustomModel ? (
                <StyledDropdown
                  value={testConfig.model}
                  onChange={(value) => {
                    if (value === "__custom__") {
                      onUseCustomModelChange(true)
                      onTestConfigChange({ model: "" })
                    } else {
                      onTestConfigChange({ model: value })
                    }
                  }}
                  options={[
                    {
                      value: "",
                      label: configuredModel
                        ? `Use configured model (${configuredModel})`
                        : "Use configured model"
                    },
                    ...models.map((model) => ({ value: model, label: model })),
                    { value: "__custom__", label: "Enter custom model..." },
                  ]}
                  size="md"
                />
              ) : (
                <div className="space-y-1.5">
                  <StyledInput
                    type="text"
                    value={testConfig.model}
                    onChange={(e) => onTestConfigChange({ model: e.target.value })}
                    placeholder="Enter custom model name (e.g., gpt-4-turbo-preview)"
                    size="md"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onUseCustomModelChange(false)
                      onTestConfigChange({ model: "" })
                    }}
                    className="text-xs text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    ← Back to model list
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Temperature <span className="text-xs text-slate-400 font-normal">(optional)</span>
              </label>
              <StyledInput
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={testConfig.temperature ?? ""}
                onChange={(e) =>
                  onTestConfigChange({
                    temperature: e.target.value ? parseFloat(e.target.value) : undefined,
                  })
                }
                placeholder="Leave empty to use configured"
                size="md"
              />
              <p className="mt-1 text-xs text-slate-400">
                Range: 0.0-2.0. GPT-5 models only support temperature 1.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Max Tokens <span className="text-xs text-slate-400 font-normal">(optional)</span>
              </label>
              <StyledInput
                type="number"
                min="1"
                max="100000"
                step="1"
                value={testConfig.maxTokens ?? ""}
                onChange={(e) =>
                  onTestConfigChange({
                    maxTokens: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                placeholder="Leave empty to use configured (default: 6000)"
                size="md"
              />
            </div>
          </div>
        )}
      </div>

      {/* Statistics Loading Status */}
      {testConfig.userName && (
        <div className="mt-6 pt-6 border-t border-slate-700/50">
          {loadingStatistics ? (
            <div className="text-xs text-slate-400">
              Loading statistics for {testConfig.userName} ({testConfig.year})...
            </div>
          ) : statisticsError ? (
            <div className="text-xs text-red-400">
              Error loading statistics: {statisticsError}
            </div>
          ) : statistics ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs text-green-400">
                  ✓ Statistics loaded for {testConfig.userName} ({testConfig.year})
                </div>
                <button
                  type="button"
                  onClick={() => onShowStatisticsChange(!showStatistics)}
                  className="text-xs text-slate-400 hover:text-slate-300 transition-colors flex items-center gap-1"
                >
                  {showStatistics ? "Hide" : "View"} Statistics
                  <svg
                    className={`w-3 h-3 transition-transform ${showStatistics ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Statistics Viewer */}
              {showStatistics && (
                <StatisticsViewer
                  statistics={statistics}
                  viewMode={statisticsViewMode}
                  onViewModeChange={onStatisticsViewModeChange}
                />
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Cost Display - Show actual cost if available, otherwise show estimate */}
      {(tokenUsage || costEstimate) && (
        <div className="mt-6 pt-6 border-t border-slate-700/50">
          <div className={`bg-slate-800/50 rounded-lg p-3 border ${tokenUsage ? 'border-green-500/20' : 'border-purple-500/20'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs font-semibold text-white">
                  {tokenUsage ? "Actual Cost" : "Estimated Cost"}
                </span>
                <span className="text-xs text-slate-400">
                  ({tokenUsage ? (selectedModel || configuredModel || "gpt-4") : costEstimate?.model})
                </span>
              </div>
              <div className={`text-base font-bold ${tokenUsage ? 'text-green-400' : 'text-purple-400'}`}>
                ${tokenUsage ? tokenUsage.cost.toFixed(4) : costEstimate?.cost.toFixed(4)}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-slate-400">
              {tokenUsage ? (
                <>
                  <span>{tokenUsage.promptTokens.toLocaleString()} prompt tokens</span>
                  <span>•</span>
                  <span>{tokenUsage.completionTokens.toLocaleString()} completion tokens</span>
                  <span>•</span>
                  <span>{tokenUsage.totalTokens.toLocaleString()} total tokens</span>
                </>
              ) : (
                <>
                  <span>~{costEstimate?.promptTokens.toLocaleString()} prompt tokens</span>
                  <span>•</span>
                  <span>~{costEstimate?.estimatedCompletionTokens.toLocaleString()} est. completion</span>
                </>
              )}
            </div>
            {tokenUsage && (
              <div className="mt-2 pt-2 border-t border-slate-700/50">
                <div className="text-xs text-slate-400">
                  ✓ This cost has been recorded in the cost analysis dashboard
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-6 pt-6 border-t border-slate-700/50">
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={onRenderTemplate}
            disabled={isPending || !testConfig.userName || !statistics || loadingStatistics}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending
              ? "Rendering..."
              : loadingStatistics
              ? "Loading statistics..."
              : !statistics
              ? "Waiting for statistics..."
              : "Render Template"}
          </button>
          <button
            onClick={onGenerateResponse}
            disabled={isPending || !testConfig.userName || !statistics || loadingStatistics}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 0L14.5 8.5L23 11L14.5 13.5L12 22L9.5 13.5L1 11L9.5 8.5L12 0Z" />
              <path d="M5 3L5.5 5.5L8 6L5.5 6.5L5 9L4.5 6.5L2 6L4.5 5.5L5 3Z" />
              <path d="M19 17L19.5 19.5L22 20L19.5 20.5L19 23L18.5 20.5L16 20L18.5 19.5L19 17Z" />
            </svg>
            {isPending
              ? "Generating..."
              : loadingStatistics
              ? "Loading statistics..."
              : !statistics
              ? "Waiting for statistics..."
              : "Generate Response"}
          </button>
        </div>
      </div>
    </div>
  )
}

