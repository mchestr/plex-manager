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
  "mm.1": "Up past the credits, every night.",
  "mm.2": "One more episode was the whole plan.",
  "mm.3": "The best scenes start after dark.",
  "mm.4": "Sleep can wait for the next season.",
  "mm.5": "Lights off, volume low, play on.",
  "cr.1": "Every story, all the way to the end.",
  "cr.2": "Nothing left unfinished.",
  "cr.3": "Stays for the last line of the credits.",
  "cr.4": "If it starts, it finishes.",
  "cr.5": "The ending is the best part.",
  "rw.1": "Old favourites, new again.",
  "rw.2": "Some stories never wear out.",
  "rw.3": "Home is a show you already know.",
  "rw.4": "The familiar is the point.",
  "rw.5": "Back to the good part, again.",
  "pc.1": "First in line, every release.",
  "pc.2": "New is the best genre.",
  "pc.3": "No spoiler ever stood a chance.",
  "pc.4": "Opening night, from the couch.",
  "pc.5": "Fresh off the press, straight to the screen.",
  "sd.1": "Whole seasons, gone in a sitting.",
  "sd.2": "Next episode, always.",
  "sd.3": "A season is just a long evening.",
  "sd.4": "The next episode was never optional.",
  "sd.5": "Watch first, ask questions later.",
  "wd.1": "The weekend is the main event.",
  "wd.2": "Saved up all week for this.",
  "wd.3": "A free weekend is a full program.",
  "wd.4": "The week is just the trailer.",
  "wd.5": "Big nights, saved for the weekend.",
  "cu.1": "Fewer titles, better choices.",
  "cu.2": "Chosen with care, watched with intent.",
  "cu.3": "Quality over quantity, always.",
  "cu.4": "A short list, carefully kept.",
  "cu.5": "Every pick was a decision.",
  "ex.1": "Always something new on the screen.",
  "ex.2": "Never the same thing again.",
  "ex.3": "Curious about everything in the library.",
  "ex.4": "The road less watched.",
  "ex.5": "The next discovery is the whole point.",
  "lo.1": "A few shows, loved completely.",
  "lo.2": "Loyal to the end of every season.",
  "lo.3": "When you find the right show, you stay.",
  "lo.4": "The same favourites, all year long.",
  "lo.5": "Devoted, and not a bit sorry.",
  "gh.1": "Same time, every evening.",
  "gh.2": "Prime time is your time.",
  "gh.3": "The evening slot is sacred.",
  "gh.4": "Dinner, then the next chapter.",
  "gh.5": "Like clockwork, every night.",
  "fj.1": "A serious diet of cinema.",
  "fj.2": "Every film deserves a fair hearing.",
  "fj.3": "From art house to blockbuster.",
  "fj.4": "The festival never closes here.",
  "fj.5": "Taste, tested film by film.",
  "cc.1": "Only when it is worth it.",
  "cc.2": "Selective, and proud of it.",
  "cc.3": "A little, but always well chosen.",
  "cc.4": "Careful about what makes the cut.",
  "cc.5": "Quality time, in small doses.",
} as const satisfies Record<(typeof POSTER_LINE_IDS)[number], string>

export const POSTER_LINES: Readonly<Record<string, string>> = LINES
