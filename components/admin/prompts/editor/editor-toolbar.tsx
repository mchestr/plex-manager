"use client"

import { Redo2, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"

interface EditorToolbarProps {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="hidden rounded-sm border border-border px-1 font-mono text-caption text-muted-foreground pointer-fine:inline">
      {children}
    </kbd>
  )
}

/** Undo and Redo for the style guide, with their shortcuts. */
export function EditorToolbar({ canUndo, canRedo, onUndo, onRedo }: EditorToolbarProps) {
  return (
    <div role="toolbar" aria-label="Edit history" className="flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        icon={<Icon icon={Undo2} />}
        disabled={!canUndo}
        onClick={onUndo}
        aria-keyshortcuts="Control+Z Meta+Z"
        data-testid="admin-prompt-editor-undo"
      >
        Undo <Kbd>Ctrl Z</Kbd>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        icon={<Icon icon={Redo2} />}
        disabled={!canRedo}
        onClick={onRedo}
        aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
        data-testid="admin-prompt-editor-redo"
      >
        Redo <Kbd>Ctrl Shift Z</Kbd>
      </Button>
    </div>
  )
}
