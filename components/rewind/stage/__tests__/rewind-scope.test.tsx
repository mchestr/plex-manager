import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useEffect } from "react"

import { RewindScope } from "@/components/rewind/stage/rewind-scope"
import { useSetStageArchetype, useSetStageInk } from "@/components/rewind/stage/stage-ink"
import { Button } from "@/components/ui/button"
import { usePortalContainer } from "@/components/ui/portal-container"
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

/**
 * The scope sits above `/rewind/[year]`'s loading boundary, so its context
 * must not change while the page streams: a change then makes React render
 * the page a second time beside the hidden streamed copy (two stages).
 */
describe("RewindScope", () => {
  it("does not change the portal context when it mounts or when the stage reports its ink", () => {
    const seen: unknown[] = []
    let report: { ink: ReturnType<typeof useSetStageInk>; archetype: ReturnType<typeof useSetStageArchetype> } | undefined
    function Consumer() {
      seen.push(usePortalContainer())
      const ink = useSetStageInk()
      const archetype = useSetStageArchetype()
      useEffect(() => {
        report = { ink, archetype }
      }, [ink, archetype])
      return null
    }

    render(
      <RewindScope fontClassName="fonts">
        <Consumer />
      </RewindScope>
    )
    act(() => {
      report?.ink({ ink: "coral", opts: {} })
      report?.archetype("credits-roller")
    })

    expect(seen).toHaveLength(1)
    expect(screen.getByTestId("rewind-scope")).toHaveAttribute("data-stage-ink", "coral")
    expect(screen.getByTestId("rewind-scope")).toHaveAttribute("data-archetype", "credits-roller")
  })

  it("portals sheets into the scope root on paper in the Rewind fonts", async () => {
    const user = userEvent.setup()
    render(
      <RewindScope fontClassName="rewind-fonts">
        <Sheet>
          <SheetTrigger render={<Button />}>Open</SheetTrigger>
          <SheetContent side="bottom">
            <SheetTitle>Settings</SheetTitle>
            <SheetDescription>Story settings</SheetDescription>
          </SheetContent>
        </Sheet>
      </RewindScope>
    )

    await user.click(screen.getByRole("button", { name: "Open" }))
    const sheet = await waitFor(() => screen.getByRole("dialog"))
    expect(screen.getByTestId("rewind-scope")).toContainElement(sheet)
    expect(sheet).toHaveAttribute("data-field", "paper")
    expect(sheet).toHaveClass("rewind-fonts")
  })
})
