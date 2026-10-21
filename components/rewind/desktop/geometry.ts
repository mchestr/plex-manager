/**
 * Where the desktop spread puts the artboard (design 4.7, P7.4): under the
 * 100 px top bar, centred in the column between the contents rail and the
 * Notes, at `--u` (the stage sets `--u` from `--rw-u-spread` under the
 * `rw-spread:` variant). `--rw-rail-w` and `--rw-notes-w` come from
 * `spreadColumns()` through `useFitStage`. The translate also makes the box
 * the containing block of a page's fixed layers (the cover's field).
 */

/** The pages layer on the spread: exactly the artboard's box. */
export const SPREAD_PAGES =
  "rw-spread:inset-auto rw-spread:top-[100px] rw-spread:left-[calc((100%_+_var(--rw-rail-w)_-_var(--rw-notes-w))/2)] rw-spread:h-[calc(693px*var(--u))] rw-spread:w-[calc(390px*var(--u))] rw-spread:-translate-x-1/2"

/** The same box for the frame, crop marks and the previous and next buttons, inside the spread chrome. */
export const SPREAD_BOX =
  "absolute top-[100px] left-[calc((100%_+_var(--rw-rail-w)_-_var(--rw-notes-w))/2)] h-[calc(693px*var(--u))] w-[calc(390px*var(--u))] -translate-x-1/2"

/** The rail and the Notes: below the top bar, beside the gutters, scrolling only vertically. */
export const SPREAD_SIDE = "absolute top-[100px] bottom-6 overflow-x-hidden overflow-y-auto overscroll-contain"
