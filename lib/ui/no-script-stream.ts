/**
 * With JavaScript off, `app/loading.tsx` leaves a streamed page in a hidden
 * `S:` segment behind its fallback. These rules show the segment and hide
 * the fallback, so a page reads without any script. Render them as
 * `<noscript><style>{NO_SCRIPT_STREAM}</style></noscript>`. They match
 * nothing when the page did not stream. The rules sit in Tailwind's `base`
 * layer: its preflight hides `[hidden]` with a layered `!important`, which
 * beats any unlayered one.
 *
 * Use it only on a route with no second Suspense boundary, so the segment
 * holds the whole page in order: the Rewind article and the pages an email
 * links to.
 */
export const NO_SCRIPT_STREAM =
  "@layer base{div[hidden][id^=S]{display:block!important}template[id^=B]+*{display:none!important}}"
