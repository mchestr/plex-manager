"use client"

import { Copy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/components/ui/toast"

/** A shell command with a Copy button: paid evals run from the CLI, never from the page. */
export function EvalCommand({ command, "data-testid": testId }: { command: string; "data-testid": string }) {
  const toast = useToast()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      toast.showSuccess("Command copied")
    } catch {
      toast.showError("Could not copy. Select the command and copy it instead.")
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      <code className="rounded-sm border bg-muted px-2 py-1 font-mono text-label text-foreground">{command}</code>
      <Button variant="ghost" size="sm" icon={<Icon icon={Copy} />} onClick={copy} data-testid={`${testId}-copy`}>
        Copy
        <span className="sr-only"> {command}</span>
      </Button>
    </div>
  )
}
