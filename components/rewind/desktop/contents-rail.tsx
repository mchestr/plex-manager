"use client"

import { ArrowLeft, ArrowRight } from "lucide-react"
import type { ReactNode } from "react"

import { Icon } from "@/components/ui/icon"
import type { ActGroup } from "@/lib/rewind/stage/acts"
import { cn } from "@/lib/utils"

import { SPREAD_SIDE } from "./geometry"

interface ContentsRailProps {
  groups: readonly ActGroup[]
  /** Each selected page's registry name, in order. */
  names: readonly string[]
  index: number
  onGoto: (index: number) => void
}

const pad = (n: number) => String(n).padStart(2, "0")

function Key({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-sm border border-current px-1.5 font-display text-label">{children}</kbd>
}

const LEGEND: ReadonlyArray<{ keys: ReactNode[]; label: string }> = [
  {
    keys: [
      <Icon key="left" icon={ArrowLeft} label="Left arrow" />,
      <Icon key="right" icon={ArrowRight} label="Right arrow" />,
    ],
    label: "turn the page",
  },
  { keys: ["Space", "K"], label: "pause or play" },
  { keys: ["T"], label: "table" },
  { keys: ["S"], label: "share" },
  { keys: [","], label: "settings" },
  { keys: ["Esc"], label: "close" },
]

/**
 * The spread's left rail (design 4.7): every selected page under its act,
 * with its folio and registry name; the current one is marked by a 3 px ink
 * bar and `aria-current="page"`. The keyboard legend sits at its foot. The
 * rail scrolls on its own (`data-rw-scroll`), so the arrow keys scroll it
 * rather than turn the page.
 */
export function ContentsRail({ groups, names, index, onGoto }: ContentsRailProps) {
  return (
    <div data-rw-scroll className={cn(SPREAD_SIDE, "pointer-events-auto left-6 flex w-(--rw-rail-w) flex-col justify-between gap-8 pr-2")} data-testid="rewind-contents-rail">
      <nav aria-label="Contents">
        <p aria-hidden className="font-text text-2xl italic">
          Contents
        </p>
        {groups.map((group) => (
          <div key={group.act} className="mt-2">
            <p className="font-text text-body italic">{group.label}</p>
            <ol>
              {group.pages.map((page) => {
                const current = page === index
                return (
                  <li key={page}>
                    <button
                      type="button"
                      aria-current={current ? "page" : undefined}
                      data-testid="rewind-rail-item"
                      className={cn(
                        "flex min-h-7 w-full cursor-pointer items-baseline gap-3 border-l-[3px] pl-3 text-left font-display text-ui outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
                        current ? "border-current font-bold" : "border-transparent hover:underline"
                      )}
                      onClick={() => onGoto(page)}
                    >
                      <span className="font-bold tabular-nums">{pad(page + 1)}</span>
                      <span>{names[page]}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
      </nav>
      <div className="flex flex-col gap-2 text-label" data-testid="rewind-keyboard-legend">
        <ul className="flex flex-col gap-2">
          {LEGEND.map((row) => (
            <li key={row.label} className="flex items-center gap-1.5">
              {row.keys.map((key, i) => (
                <Key key={i}>{key}</Key>
              ))}
              <span className="ml-1">{row.label}</span>
            </li>
          ))}
        </ul>
        <p className="font-text italic">Letter keys work while the page has focus. Turn them off in Settings.</p>
      </div>
    </div>
  )
}
