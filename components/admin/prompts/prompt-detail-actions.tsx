"use client"

import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { newStyleGuide, playgroundWithStyleGuide, promptEdit } from "@/lib/admin/routes"
import type { PromptStatus } from "@/lib/admin/prompts/queries"

import { DeletePromptDialog, UseForRewindDialog } from "./prompt-dialogs"

interface PromptDetailActionsProps {
  prompt: { id: string; name: string; status: PromptStatus }
  current: string | null
  seasonNote: string | null
}

/** The detail page's header actions: Edit (or Copy for v2), Use for Rewind and Delete. */
export function PromptDetailActions({ prompt, current, seasonNote }: PromptDetailActionsProps) {
  const router = useRouter()
  const [dialog, setDialog] = useState<"activate" | "delete" | null>(null)
  const close = (open: boolean) => !open && setDialog(null)

  return (
    <>
      <Button
        variant="destructive"
        disabled={prompt.status === "inUse"}
        onClick={() => setDialog("delete")}
        data-testid="admin-prompt-delete"
      >
        Delete
      </Button>
      {prompt.status !== "v2" && (
        <Button data-testid="admin-prompt-playground" variant="secondary" nativeButton={false} render={<Link href={playgroundWithStyleGuide(prompt.id)} />}>
          Try in playground
        </Button>
      )}
      {prompt.status === "notInUse" && (
        <Button variant="secondary" onClick={() => setDialog("activate")} data-testid="admin-prompt-activate">
          Use for Rewind
        </Button>
      )}
      {prompt.status === "v2" ? (
        <Button nativeButton={false} render={<Link href={newStyleGuide(prompt.id)} />} data-testid="admin-prompt-copy">
          Copy into a new style guide
        </Button>
      ) : (
        <Button nativeButton={false} render={<Link href={promptEdit(prompt.id)} />} data-testid="admin-prompt-edit">
          Edit
        </Button>
      )}
      {dialog === "activate" && (
        <UseForRewindDialog prompt={prompt} current={current} seasonNote={seasonNote} open onOpenChange={close} />
      )}
      {dialog === "delete" && (
        <DeletePromptDialog prompt={prompt} open onOpenChange={close} onDeleted={() => router.push("/admin/prompts" as Route)} />
      )}
    </>
  )
}
