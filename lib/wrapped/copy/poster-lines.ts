/**
 * The sixty poster lines (G11, design 8.3): five code-written lines per
 * archetype, `mm.1` to `cc.5`. The public centrefold card prints the one the
 * model picks by id, so no free model text reaches a public surface, and a
 * template-only issue picks one by `hash(userId, slot)`.
 *
 * Each line is at most 70 characters, has no digits or number words, and
 * passes grounding rules 4 and 6.
 *
 * @module lib/wrapped/copy/poster-lines
 */

import { POSTER_LINE_IDS } from "@/lib/wrapped/archetypes/catalogue"

const LINES = {
  "mm.1": "Much of your viewing started after dark.",
  "mm.2": "The late slot was yours.",
  "mm.3": "The best scenes start after dark.",
  "mm.4": "Late nights were your time to watch.",
  "mm.5": "When the day ended, your viewing began.",
  "cr.1": "You watched to the end.",
  "cr.2": "What you started, you finished.",
  "cr.3": "You stayed until the credits rolled.",
  "cr.4": "You rarely stopped partway through.",
  "cr.5": "The ending is the best part.",
  "rw.1": "Old favourites, new again.",
  "rw.2": "Some stories never wear out.",
  "rw.3": "Home is a show you already know.",
  "rw.4": "You went back to the titles you know.",
  "rw.5": "Back to the good part, again.",
  "pc.1": "You watched new releases soon after they came out.",
  "pc.2": "New episodes did not wait long.",
  "pc.3": "You got there before the spoilers.",
  "pc.4": "Opening night, from the couch.",
  "pc.5": "You watched it while it was new.",
  "sd.1": "Episodes went by in long runs.",
  "sd.2": "You let the next episode play.",
  "sd.3": "A season is just a long evening.",
  "sd.4": "Shows took a big part of your time.",
  "sd.5": "An episode often led straight to the next.",
  "wd.1": "The weekend is the main event.",
  "wd.2": "Saved up all week for this.",
  "wd.3": "A free weekend is a full programme.",
  "wd.4": "The week is just the trailer.",
  "wd.5": "Big nights, saved for the weekend.",
  "cu.1": "Your list stayed short on purpose.",
  "cu.2": "Each title was chosen with care.",
  "cu.3": "You picked a few titles and gave them time.",
  "cu.4": "A short list, carefully kept.",
  "cu.5": "Every pick was a decision.",
  "ex.1": "Something new was often on the screen.",
  "ex.2": "You rarely went back for a repeat.",
  "ex.3": "You tried a lot of the library.",
  "ex.4": "The road less watched.",
  "ex.5": "Each new title led to another.",
  "lo.1": "A few shows kept your attention all year.",
  "lo.2": "You stayed with your shows.",
  "lo.3": "When you find the right show, you stay.",
  "lo.4": "The same favourites, all year long.",
  "lo.5": "Your top shows had your loyalty.",
  "gh.1": "The early evening was your time to watch.",
  "gh.2": "Prime time is your time.",
  "gh.3": "Your evenings had a set time for watching.",
  "gh.4": "Dinner, then the next chapter.",
  "gh.5": "You pressed play at about the same hour.",
  "fj.1": "A serious diet of cinema.",
  "fj.2": "Movies took a big part of your year.",
  "fj.3": "Your year had a lot of movies in it.",
  "fj.4": "The festival never closes here.",
  "fj.5": "You judged your year movie by movie.",
  "cc.1": "Only when it is worth it.",
  "cc.2": "You watched when you wanted to.",
  "cc.3": "You watched a little, and chose it well.",
  "cc.4": "Careful about what makes the cut.",
  "cc.5": "Quality time, in small doses.",
} as const satisfies Record<(typeof POSTER_LINE_IDS)[number], string>

export const POSTER_LINES: Readonly<Record<string, string>> = LINES
