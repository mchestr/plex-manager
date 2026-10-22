"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { setLLMDisabled } from "@/actions/admin"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"

interface LLMToggleProps {
  /** `Config.llmDisabled`. */
  disabled: boolean
}

/**
 * The master "AI features" switch (UI-31). It saves at once, apart from the
 * section's form; off forces Rewind onto template copy.
 */
export function LLMToggle({ disabled }: LLMToggleProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  const toggle = (on: boolean) => {
    startTransition(async () => {
      const result = await setLLMDisabled(!on)
      if (result.success) {
        toast.showSuccess(on ? "AI features turned on" : "AI features turned off")
        router.refresh()
      } else {
        toast.showError(result.error || "Could not change AI features")
      }
    })
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <label htmlFor="ai-features" className="text-ui font-medium text-foreground">
          AI features
        </label>
        <p id="ai-features-hint" className="text-label text-muted-foreground">
          Turn off to stop every LLM request from the app. Rewind then uses template copy.
        </p>
      </div>
      <Switch
        id="ai-features"
        checked={!disabled}
        onCheckedChange={toggle}
        loading={isPending}
        aria-describedby="ai-features-hint"
        data-testid="settings-ai-features"
      />
    </div>
  )
}
