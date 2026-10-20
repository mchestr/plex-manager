/**
 * Test helpers for the Rewind scope contract (ui-design-system 4.4).
 *
 * @module lib/design/testing
 */

/**
 * Throws when a `.dark` element sits inside a `.light` one, in or above
 * `container`. The bounded dark variant stops at `.light`, so a dark ink
 * nested in a light one would render its `dark:` classes wrongly; Rewind
 * component tests call this on their render output.
 */
export function expectNoDarkInsideLight(container: Element): void {
  const nested = [container, ...container.querySelectorAll(".dark")]
    .filter((el) => el.classList.contains("dark") && el.parentElement?.closest(".light"))
    .map((el) => el.outerHTML.slice(0, 120))
  if (nested.length > 0) {
    throw new Error(`Found .dark inside .light:\n${nested.join("\n")}`)
  }
}
