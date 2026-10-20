"use client"

import { usePlayerSend } from "@/components/rewind/stage/player-context"
import { Button } from "@/components/ui/button"

/** A stand-in for P5.6's quiz: an interactive island that never turns the page by itself. */
export default function AnswerIsland() {
  const send = usePlayerSend()
  return (
    <div data-rw-interactive className="flex gap-3">
      <Button variant="ink-outline" size="pill" data-testid="dev-rewind-answer" onClick={() => send({ type: "INTERACT_END" })}>
        Answer
      </Button>
      <Button variant="ink" size="pill" onClick={() => send({ type: "NEXT", source: "button" })}>
        Skip
      </Button>
    </div>
  )
}
