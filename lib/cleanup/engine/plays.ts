/**
 * The watch signals of media cleanup (E15): a counted play and a finished
 * play, with the definitions of Rewind.
 *
 * Copies of `isCountedPlay` and `isFinished` in
 * `lib/wrapped/sources/watch-history-source.ts` (lines 130 to 148). The copy
 * keeps cleanup out of Rewind's freeze area, so this file never imports
 * `lib/wrapped`. `plays.test.ts` checks that both copies give the same answer
 * on one shared table. Pure and client-safe.
 *
 * @module lib/cleanup/engine/plays
 */

/** What a counted play needs: the seconds played and the percent reached. */
export interface PlayLength {
  playSeconds: number
  percentComplete: number
}

/** What a finished play needs: Tautulli's `watched_status` (0 to 1) and the percent reached. */
export interface PlayEnd {
  watchedStatus: number
  percentComplete: number
}

/** A counted play: at least two minutes played, or 90 % reached. */
export function isCountedPlay(e: PlayLength): boolean {
  return e.playSeconds >= 120 || e.percentComplete >= 90
}

/** A finished play: Tautulli marked it watched, or it reached 90 %. */
export function isFinished(e: PlayEnd): boolean {
  return e.watchedStatus >= 1 || e.percentComplete >= 90
}
