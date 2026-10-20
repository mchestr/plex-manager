"use client"

import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import { m, useReducedMotion } from "motion/react"
import { useEffect, useState, type CSSProperties, type ReactNode } from "react"

import { usePlayerSend } from "@/components/rewind/stage/player-context"
import { useQuiz } from "@/components/rewind/stage/quiz-context"
import { useStagePage } from "@/components/rewind/stage/stage-page"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface QuizTile {
  key: string
  /** 1 is the answer. */
  rank: number
  title: string
  /** The title, typeset on the server in up to 3 balanced lines. */
  titleLines: ReactNode
  /** The full-colour poster, with its title card fallback. */
  art: ReactNode
  /** The answer's watch time, shown on the back of its tile. */
  hours: string | null
}

interface QuizProps {
  kind: "series" | "mixed"
  /** The page's `h2`, which names the group. */
  labelledBy: string
  tiles: readonly QuizTile[]
  /** The reveal line for each rank. */
  reveals: Readonly<Record<number, string>>
}

const FLIP = { duration: 0.42, ease: [0.16, 1, 0.3, 1] as const }

/** The answer's tile turns over to show "No. 1" and its hours (420 ms on Y; a 120 ms crossfade under reduced motion). */
function TileArt({ art, back, flipped, reduce }: { art: ReactNode; back: ReactNode | null; flipped: boolean; reduce: boolean }) {
  if (!back) return art
  if (reduce) {
    return (
      <span className="relative block">
        <span className={cn("block transition-opacity duration-(--rw-dur-xs)", flipped && "opacity-0")}>{art}</span>
        <span className={cn("absolute inset-0 transition-opacity duration-(--rw-dur-xs)", flipped ? "opacity-100" : "opacity-0")}>{back}</span>
      </span>
    )
  }
  return (
    <span className="relative block perspective-[600px]">
      <m.span className="relative block transform-3d" animate={{ rotateY: flipped ? 180 : 0 }} transition={FLIP}>
        <span className="block backface-hidden">{art}</span>
        <span className="absolute inset-0 rotate-y-180 backface-hidden">{back}</span>
      </m.span>
    </span>
  )
}

/**
 * 04 Guess's answers (design 4.3): a `radiogroup` of full-colour poster
 * tiles and "Skip", with no timer. The arrows move the checked tile; a tap,
 * a click or Space answers. The player waits in `interacting` until the
 * member answers (`INTERACT_END`, after which the reveal holds for its
 * dwell) or skips (the next page). The answer stays in the stage's
 * `QuizContext` and session storage, never on the server.
 *
 * The reveal: the answer's tile turns over, the other tiles' art fades to
 * 45% under a hatch while their titles keep full ink, and the line under the
 * grid says how close the guess was.
 */
export function Quiz({ kind, labelledBy, tiles, reveals }: QuizProps) {
  const send = usePlayerSend()
  const { answer, setAnswer } = useQuiz()
  const { distance } = useStagePage()
  const reduce = useReducedMotion() ?? false
  const pick = answer && "key" in answer && tiles.some((t) => t.key === answer.key) ? answer : null
  const [checked, setChecked] = useState<string | null>(null)

  // An answered quiz never holds the story again: on a return visit or a reload, release the player.
  useEffect(() => {
    if (distance === 0 && answer) send({ type: "INTERACT_END" })
  }, [distance, answer, send])

  const choose = (tile: QuizTile) => {
    if (pick) return
    setAnswer({ key: tile.key, rank: tile.rank, title: tile.title, kind })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-rw-interactive>
      <RadioGroup
        aria-labelledby={labelledBy}
        value={pick?.key ?? checked}
        onValueChange={(value) => setChecked(value as string)}
        readOnly={pick !== null}
        className="grid grid-cols-2 gap-x-[calc(var(--u)*16px)] gap-y-[calc(var(--u)*12px)]"
      >
        {tiles.map((tile, i) => {
          const isAnswer = tile.rank === 1
          const faded = pick !== null && !isAnswer
          return (
            <Radio.Root
              key={tile.key}
              value={tile.key}
              data-testid={`rewind-quiz-option-${i + 1}`}
              onClick={() => choose(tile)}
              className="rw-stagger group flex cursor-pointer flex-col items-start gap-[calc(var(--u)*6px)] text-left outline-none transition-transform duration-(--rw-dur-xs) active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-[3px] focus-visible:ring-offset-background"
              style={{ "--rw-i": i } as CSSProperties}
            >
              <span className="relative block" data-rw-quiz-pick={pick?.key === tile.key || undefined}>
                <TileArt
                  reduce={reduce}
                  flipped={pick !== null && isAnswer}
                  art={
                    <span className="relative block">
                      <span className={cn("block transition-opacity duration-(--rw-dur-m)", faded && "opacity-45")}>{tile.art}</span>
                      {faded && <span aria-hidden className="rw-hatch absolute inset-0 opacity-60" />}
                    </span>
                  }
                  back={
                    isAnswer ? (
                      <span className="flex size-full flex-col justify-end bg-foreground p-[calc(var(--u)*8px)] text-background" data-testid="rewind-quiz-answer">
                        <span className="font-display text-[length:calc(var(--u)*15px)] font-semibold">No. 1</span>
                        {tile.hours && <span className="font-display text-[length:calc(var(--u)*30px)] leading-none font-black tabular-nums">{tile.hours}</span>}
                      </span>
                    ) : null
                  }
                />
              </span>
              <span className="block w-full">{tile.titleLines}</span>
              {pick && (
                <span className="font-text text-[length:max(12px,calc(var(--u)*13.5px))] italic" data-testid="rewind-quiz-mark">
                  {pick.key === tile.key ? "Your answer" : "Not your answer"}
                </span>
              )}
            </Radio.Root>
          )
        })}
      </RadioGroup>
      <div className="mt-auto flex min-h-[calc(var(--u)*44px)] items-center justify-between gap-3 pb-[calc(var(--u)*8px)]">
        <p role="status" className="font-lead text-[length:calc(var(--u)*24px)] leading-tight" data-testid="rewind-quiz-reveal">
          {pick ? reveals[pick.rank] : ""}
        </p>
        {!pick && (
          <Button
            variant="ink-outline"
            size="pill"
            data-testid="rewind-quiz-skip"
            onClick={() => {
              setAnswer({ skipped: true })
              send({ type: "NEXT", source: "button" })
            }}
          >
            Skip
          </Button>
        )}
      </div>
    </div>
  )
}
