/**
 * Design 5.2's rules per page (P5.5): for every registry page and every
 * archetype, after `altField`, the resolved spot reads 3:1 or better on the
 * resolved field, and the title-card pair reads 7:1 or better. A title card
 * prints the lighter of spot and field on the darker one, or, where that pair
 * is under 7:1, the field colour on the ink (design 5.3).
 */

import { contrast, hexToRgb } from "@/lib/design/color"
import { archetypeInks, rewindInks, type InkName } from "@/lib/design/tokens"
import { issuePages } from "@/lib/rewind/registry"
import { pageInk } from "@/lib/rewind/stage/page-ink"
import { ARCHETYPE_IDS, type ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"

const rgb = (hex: string) => hexToRgb(hex).rgb

function resolved(page: (typeof issuePages)[number], archetype: ArchetypeId) {
  const { ink, opts } = pageInk(page, archetype)
  const arch = archetypeInks[archetype]
  const colours = rewindInks[ink]
  const archDeep = rewindInks[arch.deep as InkName].deep.hex
  const text = opts.ink === "arch-deep" ? archDeep : colours.on.hex
  let spot: string
  if (opts.spot === "arch") spot = arch.spot === "own" ? colours.on.hex : rewindInks[arch.spot as InkName].field.hex
  else if (opts.ink === "arch-deep" || colours.spot === "arch-deep") spot = archDeep
  else spot = colours.spot === "on" ? colours.on.hex : rewindInks[colours.spot].field.hex
  return { ink, opts, field: rgb(colours.field.hex), text: rgb(text), spot: rgb(spot) }
}

const cases = issuePages.flatMap((page) => ARCHETYPE_IDS.map((archetype) => [page.name, archetype, page] as const))

describe("registry tokens (design 5.2 and 5.3)", () => {
  it.each(cases)("%s for %s: spot 3:1 on the field, title card 7:1", (_name, archetype, page) => {
    const { field, text, spot } = resolved(page, archetype)
    expect(contrast(text, field)).toBeGreaterThanOrEqual(7)
    expect(contrast(spot, field)).toBeGreaterThanOrEqual(3)
    const card = contrast(spot, field) >= 7 ? contrast(spot, field) : contrast(field, text)
    expect(card).toBeGreaterThanOrEqual(7)
  })

  it.each(cases)("%s for %s: the registry's spot names the rule the ink resolves", (_name, archetype, page) => {
    const { ink, opts } = resolved(page, archetype)
    if (page.spot === "arch") expect(opts.spot).toBe("arch")
    else if (page.spot === "arch-deep") expect(ink).toBe("paper")
    else expect(rewindInks[ink].spot).not.toBe("arch-deep")
  })
})
