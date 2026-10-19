/**
 * The status vocabulary (ui-design-system 5.6). For now only the tones;
 * P3.9 adds the `STATUS` table of words and tones per domain.
 */

/** How a state reads: a status colour, a neutral or outline badge, or plain text. */
export type Tone = "success" | "warning" | "info" | "destructive" | "neutral" | "outline" | "plain"
