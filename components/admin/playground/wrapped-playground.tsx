"use client"

import { savePlaygroundWrapped } from "@/actions/playground-wrapped"
import { testPromptTemplate } from "@/actions/prompt-test"
import { useToast } from "@/components/ui/sonner"
import { usePlaygroundState } from "@/hooks/use-playground-state"
import { estimateCost } from "@/lib/llm/pricing"
import { parseWrappedResponse } from "@/lib/wrapped/prompt"
import { generateSystemPrompt } from "@/lib/wrapped/prompt-template"
import { WrappedData, WrappedStatistics } from "@/types/wrapped"
import { PromptTemplate } from "@/lib/generated/prisma/client"
import { useEffect, useMemo, useState } from "react"
import { LLMResponse } from "@/components/admin/playground/llm-response"
import { PreviewModal } from "@/components/admin/playground/preview-modal"
import { RenderedPrompt } from "@/components/admin/playground/rendered-prompt"
import { StatisticsViewer } from "@/components/admin/playground/statistics-viewer"
import { TemplateSelector } from "@/components/admin/playground/template-selector"
import { TestConfiguration } from "@/components/admin/playground/test-configuration"

interface PlexUser {
  id: string
  name: string
  email?: string
  thumb?: string
  restricted: boolean
  serverAdmin: boolean
}

interface WrappedPlaygroundProps {
  templates: PromptTemplate[]
  initialTemplateId?: string
}

export function WrappedPlayground({ templates, initialTemplateId }: WrappedPlaygroundProps) {
  const toast = useToast()
  const {
    selectedTemplateId,
    setSelectedTemplateId,
    testConfig,
    setTestConfig,
    useCustomModel,
    setUseCustomModel,
    result,
    setResult,
    showStatistics,
    setShowStatistics,
    statisticsViewMode,
    setStatisticsViewMode,
    showAIParameters,
    setShowAIParameters,
    showRenderedPrompt,
    setShowRenderedPrompt,
    clearSavedState,
  } = usePlaygroundState({ templates, initialTemplateId })

  const [plexUsers, setPlexUsers] = useState<PlexUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(true)
  const [configuredModel, setConfiguredModel] = useState<string>("")
  const [statistics, setStatistics] = useState<WrappedStatistics | null>(null)
  const [loadingStatistics, setLoadingStatistics] = useState(false)
  const [statisticsError, setStatisticsError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [previewData, setPreviewData] = useState<WrappedData | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Fetch Plex users
  useEffect(() => {
    async function fetchUsers() {
      try {
        setLoadingUsers(true)
        const response = await fetch("/api/admin/plex/users")
        if (response.ok) {
          const data = await response.json()
          setPlexUsers(data.users || [])
        } else {
          toast.showError("Failed to fetch Plex users")
        }
      } catch (error) {
        console.error("Failed to fetch Plex users:", error)
        toast.showError(error instanceof Error ? error.message : "Failed to fetch Plex users")
      } finally {
        setLoadingUsers(false)
      }
    }
    fetchUsers()
  }, [])

  // Fetch models
  useEffect(() => {
    async function fetchModels() {
      try {
        setLoadingModels(true)
        const response = await fetch("/api/admin/models")
        if (response.ok) {
          const data = await response.json()
          setModels(data.models || [])
          setConfiguredModel(data.configuredModel || "")
        } else {
          toast.showError("Failed to fetch models")
        }
      } catch (error) {
        console.error("Failed to fetch models:", error)
        toast.showError(error instanceof Error ? error.message : "Failed to fetch models")
      } finally {
        setLoadingModels(false)
      }
    }
    fetchModels()
  }, [])

  // Fetch statistics when user/year changes
  useEffect(() => {
    async function fetchStats() {
      if (!testConfig.userName || !testConfig.year) {
        setStatistics(null)
        setStatisticsError(null)
        return
      }

      try {
        setLoadingStatistics(true)
        setStatisticsError(null)
        const response = await fetch(
          `/api/admin/playground/statistics?userName=${encodeURIComponent(testConfig.userName)}&year=${testConfig.year}`
        )
        if (response.ok) {
          const data = await response.json()
          setStatistics(data.statistics || null)
        } else {
          const errorData = await response.json()
          setStatisticsError(errorData.error || "Failed to fetch statistics")
          setStatistics(null)
        }
      } catch (error) {
        console.error("Failed to fetch statistics:", error)
        setStatisticsError(error instanceof Error ? error.message : "Failed to fetch statistics")
        setStatistics(null)
      } finally {
        setLoadingStatistics(false)
      }
    }

    fetchStats()
  }, [testConfig.userName, testConfig.year])

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)

  // Calculate cost estimate when we have a rendered prompt
  const costEstimate = useMemo(() => {
    if (!result?.renderedPrompt) return undefined

    const model = testConfig.model || configuredModel || "gpt-4"
    const systemPrompt = generateSystemPrompt()
    const estimate = estimateCost(
      result.renderedPrompt,
      model,
      testConfig.maxTokens,
      systemPrompt
    )

    return {
      ...estimate,
      model,
    }
  }, [result?.renderedPrompt, testConfig.model, testConfig.maxTokens, configuredModel])

  const handleRenderTemplate = async () => {
    if (!testConfig.userName || !statistics || !selectedTemplate) return

    setIsPending(true)
    setResult(null)
    setSaveError(null)
    setPreviewError(null)

    try {
      const result = await testPromptTemplate({
        userName: testConfig.userName,
        year: testConfig.year,
        statistics,
        sendToAI: false,
        templateString: selectedTemplate.template,
      })

      if (result.success && result.renderedPrompt) {
        setResult({
          renderedPrompt: result.renderedPrompt,
        })
      } else {
        setSaveError(result.error || "Failed to render template")
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to render template")
    } finally {
      setIsPending(false)
    }
  }

  const handleGenerateResponse = async () => {
    if (!testConfig.userName || !statistics || !selectedTemplate) return

    setIsPending(true)
    setResult(null)
    setSaveError(null)
    setPreviewError(null)

    try {
      const result = await testPromptTemplate({
        userName: testConfig.userName,
        year: testConfig.year,
        statistics,
        sendToAI: true,
        templateString: selectedTemplate.template,
        model: testConfig.model || undefined,
        temperature: testConfig.temperature,
        maxTokens: testConfig.maxTokens,
      })

      if (result.success && result.renderedPrompt) {
        setResult({
          renderedPrompt: result.renderedPrompt,
          llmResponse: result.llmResponse,
          tokenUsage: result.tokenUsage,
        })
      } else {
        setSaveError(result.error || "Failed to generate response")
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to generate response")
    } finally {
      setIsPending(false)
    }
  }

  const handlePreview = () => {
    if (!result?.llmResponse || !statistics) {
      setPreviewError("No response available to preview")
      return
    }

    try {
      const user = plexUsers.find((u) => u.name === testConfig.userName)
      const wrappedData = parseWrappedResponse(
        result.llmResponse,
        statistics,
        testConfig.year,
        user?.id || "",
        testConfig.userName
      )
      setPreviewData(wrappedData)
      setShowPreview(true)
      setPreviewError(null)
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Failed to parse wrapped data")
    }
  }

  const handleSave = async () => {
    if (!result?.llmResponse || !statistics) {
      setSaveError("No response available to save")
      return
    }

    setIsSaving(true)
    setSaveError(null)

    try {
      const saveResult = await savePlaygroundWrapped({
        llmResponse: result.llmResponse,
        statistics,
        userName: testConfig.userName,
        year: testConfig.year,
      })

      if (saveResult.success) {
        // Close preview and show success
        setShowPreview(false)
        toast.showSuccess(
          `Wrapped saved successfully! User ID: ${saveResult.userId}, Wrapped ID: ${saveResult.wrappedId}`
        )
      } else {
        const errorMessage = saveResult.error || "Failed to save wrapped"
        setSaveError(errorMessage)
        toast.showError(errorMessage)
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save wrapped")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Template Selector */}
      <TemplateSelector
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        onTemplateChange={setSelectedTemplateId}
      />

      {/* Test Configuration */}
      <TestConfiguration
        testConfig={{
          userName: testConfig.userName,
          year: testConfig.year,
          model: testConfig.model,
          temperature: testConfig.temperature,
          maxTokens: testConfig.maxTokens,
        }}
        onTestConfigChange={(config) => setTestConfig(config)}
        plexUsers={plexUsers}
        loadingUsers={loadingUsers}
        models={models}
        loadingModels={loadingModels}
        configuredModel={configuredModel}
        useCustomModel={useCustomModel}
        onUseCustomModelChange={setUseCustomModel}
        statistics={statistics}
        loadingStatistics={loadingStatistics}
        statisticsError={statisticsError}
        showStatistics={showStatistics}
        onShowStatisticsChange={setShowStatistics}
        statisticsViewMode={statisticsViewMode}
        onStatisticsViewModeChange={setStatisticsViewMode}
        showAIParameters={showAIParameters}
        onShowAIParametersChange={setShowAIParameters}
        onRenderTemplate={handleRenderTemplate}
        onGenerateResponse={handleGenerateResponse}
        isPending={isPending}
        costEstimate={costEstimate}
        tokenUsage={result?.tokenUsage}
        selectedModel={testConfig.model || undefined}
        onReset={() => {
          clearSavedState()
          window.location.reload()
        }}
      />

      {/* Statistics Viewer */}
      {showStatistics && statistics && (
        <StatisticsViewer
          statistics={statistics}
          viewMode={statisticsViewMode}
          onViewModeChange={setStatisticsViewMode}
        />
      )}

      {/* Rendered Prompt */}
      {result?.renderedPrompt && showRenderedPrompt && (
        <RenderedPrompt
          renderedPrompt={result.renderedPrompt}
          isExpanded={true}
          onToggle={() => setShowRenderedPrompt(!showRenderedPrompt)}
        />
      )}

      {/* LLM Response */}
      {result?.llmResponse && (
        <LLMResponse
          llmResponse={result.llmResponse}
          onPreview={handlePreview}
          onSave={handleSave}
          isSaving={isSaving}
          saveError={saveError}
          previewError={previewError}
        />
      )}

      {/* Preview Modal */}
      <PreviewModal
        show={showPreview}
        wrappedData={previewData}
        userName={testConfig.userName}
        year={testConfig.year}
        onClose={() => {
          setShowPreview(false)
          setPreviewData(null)
          setPreviewError(null)
        }}
        onSave={handleSave}
        isSaving={isSaving}
        saveError={saveError}
        canSave={!!result?.llmResponse && !!statistics}
      />
    </div>
  )
}

