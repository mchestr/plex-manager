"use client"

import { useId, useLayoutEffect, useState } from "react"

import { Alert } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { Fieldset } from "@/components/ui/fieldset"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { RadioCard, RadioGroup } from "@/components/ui/radio-group"
import { Token } from "@/components/ui/token"
import { joinAnd, LEVEL_NAMES, NOUNS, SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { EditorLibrary } from "@/lib/cleanup/types/rule-parts"
import { LEVEL_ARR, LEVELS, type Level } from "@/lib/validations/cleanup-vocabulary"

/** The reason line of a live rule's level (UX 7.5 item 2, UX 8.4). */
export const READ_ONLY_LEVEL = "To change the level, move the rule back to Dry run, or duplicate it."

const LEVEL_HELP: Record<Level, string> = {
  movie: "Movies: each movie is checked on its own.",
  show: 'Whole shows: a show is checked with all its seasons and episodes. "Last played" means any episode.',
  season: "Seasons: each season is checked on its own. The newest season of a continuing show is never in scope. Specials (season 0) are never in scope.",
}

const libraryType = (level: Level): EditorLibrary["level"] => (level === "movie" ? "movie" : "show")

/** The libraries a level offers: its type, in the loader's order. */
export const librariesOf = (all: readonly EditorLibrary[], level: Level) => all.filter((l) => l.level === libraryType(level))

/** The help line of a level (UX 5.2): it names the libraries out of scope on this server. */
export function levelHelp(level: Level, libraries: readonly EditorLibrary[]): string {
  const out = librariesOf(libraries, level).filter((l) => l.disabledReason !== null).map((l) => l.title)
  if (out.length === 0) return LEVEL_HELP[level]
  const one = out.length === 1
  const arr = SERVICE_NAMES[LEVEL_ARR[level]]
  return `${LEVEL_HELP[level]} ${joinAnd(out)} ${one ? "is" : "are"} never in scope, because ${arr} does not manage ${one ? "it" : "them"}.`
}

/** The libraries after a level change: kept within one library type, else every library the new level offers. */
export function librariesForLevel(next: Level, current: Level, selected: readonly string[], all: readonly EditorLibrary[]): string[] {
  if (libraryType(next) === libraryType(current)) return [...selected]
  return librariesOf(all, next).filter((l) => l.disabledReason === null).map((l) => l.sectionId)
}

interface ScopeFieldsetProps {
  level: Level
  libraries: readonly string[]
  options: readonly EditorLibrary[]
  /** A live rule: the level token is read only (UX 7.5 item 2). */
  isLive: boolean
  /** The sentences of the conditions that do not apply to the level (UX 4.3.9 "Level changed"). */
  notApplicable: readonly string[]
  /** A save error of the libraries (`libraries`). */
  error?: string | null
  onLevel: (level: Level, libraries: string[]) => void
  onLibraries: (libraries: string[]) => void
  /** An error link to "Clean up" opens the library list (UX 7.9). A new object opens it once. */
  openLibraries?: object | null
}

/**
 * The first part of the sentence (UX 4.3.3): "Clean up [Movies] in the
 * [Movies] library." The level token opens a radio list of Movies, Whole
 * shows and Seasons. The library token opens a checkbox list of the
 * libraries of that type, where the ones out of scope show disabled, with
 * their reason. A help line under it names the libraries out of scope. On a
 * live rule the level token is read only, with its reason line.
 */
export function ScopeFieldset({ level, libraries, options, isLive, notApplicable, error, onLevel, onLibraries, openLibraries }: ScopeFieldsetProps) {
  const ids = useId()
  const [open, setOpen] = useState<"level" | "libraries" | null>(null)
  const [request, setRequest] = useState(openLibraries)
  if (openLibraries !== request) {
    setRequest(openLibraries)
    if (openLibraries) setOpen("libraries")
  }
  // The router keeps a page it leaves (Activity): a list closes as the page hides (TS 12.1 rule 8.2)
  useLayoutEffect(() => () => setOpen(null), [])

  const offered = librariesOf(options, level)
  const titles = libraries.map((id) => options.find((l) => l.sectionId === id)?.title ?? `library ${id}`)
  const libraryText = titles.length === 0 ? "Choose a library" : joinAnd(titles)
  const toggle = (id: string, checked: boolean) => onLibraries(checked ? [...libraries.filter((l) => l !== id), id] : libraries.filter((l) => l !== id))
  const opened = (which: "level" | "libraries") => (next: boolean) => setOpen(next ? which : null)

  return (
    <Fieldset legend="Clean up">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-body text-foreground">
        <span>Clean up</span>
        {isLive ? (
          <Token part="value" state="readOnly" aria-describedby={`${ids}-reason`} data-testid="admin-cleanup-scope-level">
            {LEVEL_NAMES[level]}
          </Token>
        ) : (
          <Popover open={open === "level"} onOpenChange={opened("level")}>
            <PopoverTrigger
              render={
                <Token part="value" partLabel="level" state={open === "level" ? "open" : "default"} data-testid="admin-cleanup-scope-level">
                  {LEVEL_NAMES[level]}
                </Token>
              }
            />
            <PopoverContent align="start" className="w-64 gap-2">
              <PopoverTitle id={`${ids}-level`}>Level</PopoverTitle>
              <RadioGroup<Level>
                aria-labelledby={`${ids}-level`}
                value={level}
                onValueChange={(next) => {
                  setOpen(null)
                  if (next !== level) onLevel(next, librariesForLevel(next, level, libraries, options))
                }}
                className="gap-0.5"
              >
                {LEVELS.map((value) => (
                  <RadioCard key={value} value={value} className={COMPACT} data-testid={`admin-cleanup-scope-level-${value}`}>
                    <span className="text-ui text-foreground">{LEVEL_NAMES[value]}</span>
                  </RadioCard>
                ))}
              </RadioGroup>
            </PopoverContent>
          </Popover>
        )}
        <span>in the</span>
        <Popover open={open === "libraries"} onOpenChange={opened("libraries")}>
          <PopoverTrigger
            render={
              <Token
                part="value"
                partLabel={titles.length === 1 ? "library" : "libraries"}
                state={open === "libraries" ? "open" : error ? "error" : titles.length === 0 ? "incomplete" : "default"}
                aria-describedby={error ? `${ids}-error` : undefined}
                data-testid="admin-cleanup-scope-libraries"
              >
                {libraryText}
              </Token>
            }
          />
          <PopoverContent align="start" className="w-80 gap-2">
            <PopoverTitle id={`${ids}-libraries`}>Libraries</PopoverTitle>
            <ul aria-labelledby={`${ids}-libraries`} className="flex flex-col gap-2">
              {offered.map((library) => (
                <li key={library.sectionId} className="flex items-start gap-2">
                  <Checkbox
                    id={`${ids}-library-${library.sectionId}`}
                    checked={libraries.includes(library.sectionId)}
                    disabled={library.disabledReason !== null}
                    aria-describedby={library.disabledReason ? `${ids}-why-${library.sectionId}` : undefined}
                    onCheckedChange={(checked) => toggle(library.sectionId, checked)}
                    className="mt-0.5"
                    data-testid={`admin-cleanup-scope-library-${library.sectionId}`}
                  />
                  <div className="flex flex-col gap-0.5">
                    <Label htmlFor={`${ids}-library-${library.sectionId}`} className={library.disabledReason ? "text-muted-foreground" : undefined}>
                      {library.title}
                    </Label>
                    {library.disabledReason && (
                      <p id={`${ids}-why-${library.sectionId}`} className="text-label text-muted-foreground">
                        {library.disabledReason}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
        {titles.length > 0 && <span>{titles.length === 1 ? "library." : "libraries."}</span>}
      </p>
      {error && (
        <p id={`${ids}-error`} className="text-label text-destructive">
          {error}
        </p>
      )}
      {isLive && (
        <p id={`${ids}-reason`} className="text-label text-muted-foreground">
          {READ_ONLY_LEVEL}
        </p>
      )}
      <p className="text-label text-muted-foreground">{levelHelp(level, options)}</p>
      {notApplicable.length > 0 && <LevelChanged level={level} sentences={notApplicable} />}
    </Fieldset>
  )
}

const COMPACT = "items-center rounded-md border-transparent bg-transparent px-2 py-1.5 hover:border-transparent hover:bg-accent data-checked:border-transparent"

/** "You changed the level to Movies" (UX 4.3.9, UX 8.4), naming each condition that does not apply. */
function LevelChanged({ level, sentences }: { level: Level; sentences: readonly string[] }) {
  const one = sentences.length === 1
  const items = NOUNS[level][1]
  const list = sentences.join("; ")
  return (
    <Alert tone="info" title={`You changed the level to ${LEVEL_NAMES[level]}`}>
      {one ? "1 condition does" : `${sentences.length} conditions do`} not apply to {items}: {list}.{" "}
      {one ? "It stays, marked, until you remove it" : "They stay, marked, until you remove them"} or change the level back. Save is
      blocked until then.
    </Alert>
  )
}
