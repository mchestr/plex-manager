/**
 * The mode choice (UX 4.6 item 2, 11.1 item 8, 11.3 item 9.3): a radio
 * group named by its card title, the Suggested badge, the Automatic text,
 * and a disabled Automatic card that stays focusable with its reason as
 * its description.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"

import { changeModeData, turnOnData } from "@/components/admin/cleanup/turn-on/__tests__/fixtures"
import { ModeChoice } from "@/components/admin/cleanup/turn-on/mode-choice"
import type { TurnOnChoice } from "@/components/admin/cleanup/turn-on/turn-on-words"
import type { CleanupTurnOnData } from "@/lib/cleanup/types/screens"

function Harness({ data, start = "reviewFirst", onChange }: { data: CleanupTurnOnData; start?: TurnOnChoice; onChange?: (mode: TurnOnChoice) => void }) {
  const [mode, setMode] = useState<TurnOnChoice>(start)
  return (
    <>
      <h2 id="label">At the leave date</h2>
      <ModeChoice
        data={data}
        mode={mode}
        onModeChange={(next) => {
          setMode(next)
          onChange?.(next)
        }}
        labelId="label"
        day="Dec 8"
      />
    </>
  )
}

it("names the group by its card title and each card by its mode, with its text as the description", () => {
  render(<Harness data={changeModeData()} />)

  expect(screen.getByRole("radiogroup", { name: "At the leave date" })).toHaveAttribute("data-testid", "admin-cleanup-turn-on-mode")
  const review = screen.getByRole("radio", { name: "Review first Suggested" })
  expect(review).toHaveAttribute("data-testid", "admin-cleanup-turn-on-mode-review-first")
  expect(review).toBeChecked()
  expect(review).toHaveAccessibleDescription("At each leave date the batch waits for you on the Leaving soon tab. Nothing is deleted until you approve it.")
  const automatic = screen.getByRole("radio", { name: "Automatic" })
  expect(automatic).toHaveAccessibleDescription(/^At each leave date Radarr deletes the movies and their files/)
  expect(automatic).not.toHaveAttribute("aria-disabled")
})

it("chooses an allowed mode", async () => {
  const onChange = jest.fn()
  render(<Harness data={changeModeData()} onChange={onChange} />)

  await userEvent.click(screen.getByRole("radio", { name: "Automatic" }))

  expect(onChange).toHaveBeenCalledWith("automatic")
  expect(screen.getByRole("radio", { name: "Automatic" })).toBeChecked()
})

it("marks a disabled Automatic card aria-disabled, describes it by its reason, and ignores a choice of it", async () => {
  const onChange = jest.fn()
  render(<Harness data={turnOnData()} onChange={onChange} />)

  const automatic = screen.getByRole("radio", { name: "Automatic" })
  expect(automatic).toHaveAttribute("aria-disabled", "true")
  expect(automatic).toHaveAccessibleDescription(
    "Not for this first batch, because it is more than 10 % of the movies checked (197 of 777). After the first batch, change the mode."
  )
  expect(screen.getByRole("radio", { name: "Review first Suggested" })).toHaveAccessibleDescription(/^On Dec 8 the batch waits for you/)

  await userEvent.click(automatic)
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.getByRole("radio", { name: "Review first Suggested" })).toBeChecked()
  expect(automatic).not.toBeChecked()
})

it("shows no reason text for a disabled card without one", () => {
  render(<Harness data={turnOnData({ modes: [{ mode: "reviewFirst", allowed: true }, { mode: "automatic", allowed: false }] })} />)
  expect(screen.getByRole("radio", { name: "Automatic" })).toHaveAccessibleDescription("")
})
