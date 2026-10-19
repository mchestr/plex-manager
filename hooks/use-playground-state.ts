import { useEffect, useState } from "react"

import { useIsClient } from "@/hooks/use-is-client"

const STORAGE_KEY = "playground-state"

interface SavedPlaygroundState {
  selectedTemplateId?: string
  testConfig?: {
    userName: string
    year: number
    sendToAI: boolean
    model: string
    temperature?: number
    maxTokens?: number
  }
  useCustomModel?: boolean
  result?: {
    renderedPrompt: string
    llmResponse?: string
    tokenUsage?: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
      cost: number
    }
  }
  showStatistics?: boolean
  statisticsViewMode?: "formatted" | "json"
  showAIParameters?: boolean
  showRenderedPrompt?: boolean
}

interface UsePlaygroundStateOptions {
  templates: Array<{ id: string }>
  initialTemplateId?: string
}

interface UsePlaygroundStateReturn {
  selectedTemplateId: string
  setSelectedTemplateId: (id: string) => void
  testConfig: {
    userName: string
    year: number
    sendToAI: boolean
    model: string
    temperature?: number
    maxTokens?: number
  }
  setTestConfig: (config: Partial<UsePlaygroundStateReturn["testConfig"]> | ((prev: UsePlaygroundStateReturn["testConfig"]) => UsePlaygroundStateReturn["testConfig"])) => void
  useCustomModel: boolean
  setUseCustomModel: (use: boolean) => void
  result: SavedPlaygroundState["result"] | null
  setResult: (result: SavedPlaygroundState["result"] | null) => void
  showStatistics: boolean
  setShowStatistics: (show: boolean) => void
  statisticsViewMode: "formatted" | "json"
  setStatisticsViewMode: (mode: "formatted" | "json") => void
  showAIParameters: boolean
  setShowAIParameters: (show: boolean) => void
  showRenderedPrompt: boolean
  setShowRenderedPrompt: (show: boolean) => void
  clearSavedState: () => void
}

export function usePlaygroundState({
  templates,
  initialTemplateId,
}: UsePlaygroundStateOptions): UsePlaygroundStateReturn {
  const isClient = useIsClient()
  const [hasRestoredState, setHasRestoredState] = useState(false)

  // Find initial template or use active template
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => {
    if (initialTemplateId) return initialTemplateId
    const activeTemplate = templates.find((t) => (t as any).isActive)
    return activeTemplate?.id || templates[0]?.id || ""
  })

  const [testConfig, setTestConfig] = useState<UsePlaygroundStateReturn["testConfig"]>({
    userName: "",
    year: new Date().getFullYear(),
    sendToAI: false,
    model: "",
    temperature: undefined,
    maxTokens: undefined,
  })

  const [useCustomModel, setUseCustomModel] = useState(false)
  const [result, setResult] = useState<SavedPlaygroundState["result"] | null>(null)
  const [showStatistics, setShowStatistics] = useState(false)
  const [statisticsViewMode, setStatisticsViewMode] = useState<"formatted" | "json">("formatted")
  const [showAIParameters, setShowAIParameters] = useState(false)
  const [showRenderedPrompt, setShowRenderedPrompt] = useState(true)

  // Restore state from localStorage once, during the first client render that
  // has templates (never during hydration, so the server HTML still matches).
  // Restoring is marked done whether or not anything was saved, and on error.
  if (isClient && templates.length > 0 && !hasRestoredState) {
    setHasRestoredState(true)
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const savedState: SavedPlaygroundState = JSON.parse(saved)

        // Restore template ID (but respect initialTemplateId if provided)
        if (!initialTemplateId && savedState.selectedTemplateId) {
          const templateExists = templates.some((t) => t.id === savedState.selectedTemplateId)
          if (templateExists) {
            setSelectedTemplateId(savedState.selectedTemplateId)
          }
        }

        // Restore test config
        if (savedState.testConfig) {
          setTestConfig({
            ...savedState.testConfig,
            temperature: savedState.testConfig.temperature ?? undefined,
            maxTokens: savedState.testConfig.maxTokens ?? undefined,
          })
          setUseCustomModel(savedState.useCustomModel || false)
        }

        // Restore UI preferences
        if (savedState.showStatistics !== undefined) {
          setShowStatistics(savedState.showStatistics)
        }
        if (savedState.statisticsViewMode) {
          setStatisticsViewMode(savedState.statisticsViewMode)
        }
        if (savedState.showAIParameters !== undefined) {
          setShowAIParameters(savedState.showAIParameters)
        }
        if (savedState.showRenderedPrompt !== undefined) {
          setShowRenderedPrompt(savedState.showRenderedPrompt)
        }

        // Restore result (but only if we have the data)
        if (savedState.result) {
          setResult(savedState.result || null)
        }
      }
    } catch (err) {
      console.error("Failed to load playground state from localStorage:", err)
      // Clear corrupted data
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  // Save state to localStorage whenever relevant state changes
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!hasRestoredState) return // Don't save until after initial restore

    try {
      const stateToSave: SavedPlaygroundState = {
        selectedTemplateId,
        testConfig,
        useCustomModel,
        result: result || undefined,
        showStatistics,
        statisticsViewMode,
        showAIParameters,
        showRenderedPrompt,
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave))
    } catch (err) {
      console.error("Failed to save playground state to localStorage:", err)
    }
  }, [
    hasRestoredState,
    selectedTemplateId,
    testConfig,
    useCustomModel,
    result,
    showStatistics,
    statisticsViewMode,
    showAIParameters,
    showRenderedPrompt,
  ])

  const clearSavedState = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  return {
    selectedTemplateId,
    setSelectedTemplateId,
    testConfig,
    setTestConfig: (config) => {
      if (typeof config === "function") {
        setTestConfig(config)
      } else {
        setTestConfig((prev) => ({ ...prev, ...config }))
      }
    },
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
  }
}

