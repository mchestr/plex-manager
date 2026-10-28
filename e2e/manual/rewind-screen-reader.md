# Rewind screen reader scripts

The manual release gate for Rewind (P7.15, design 11.1), run before the admin
soft launch (P7.16). axe, the forced-colours checks and the perf gates run in
CI; these two scripts cover what only a person with a real screen reader can
judge: what is announced, how often, and where focus lands.

Run both against a production build with a seeded issue (an admin's real
2026 issue, or the heavy fixture through `e2e/helpers/seed-rewind.ts`), with
autoplay on unless a step says otherwise. Record every result in the table at
the end and copy the table into the PR. A failure is either fixed (link the
commit) or recorded with the reason it is not a defect.

## Devices

| Script | Device | OS | Browser | Screen reader |
| --- | --- | --- | --- | --- |
| A | iPhone 15, then an iPhone SE (or Safari's responsive mode at 375 x 548) | iOS 26 | Safari | VoiceOver |
| B | A Moto G Power class phone (4 cores or fewer, so low-end mode is on) | Android 16 | Chrome | TalkBack |

On the iPhone SE size the article offer opens first (below the 0.8 scale
floor): run steps 1 to 3 from "Play the story", then repeat step 12 from
"Read as an article" on the offer.

## Script A: VoiceOver on iOS 26 Safari

Swipe right or left moves between elements; double-tap activates; the rotor
(two-finger rotate) picks Headings.

1. **Open from the RewindCard.** On `/`, find the Rewind card by swiping.
   Expect its title and button to be read once each. Double-tap the button.
   Expect the cover's heading to be read, and the region "Rewind 2026".
2. **First focusable element.** Swipe to the first element of the stage.
   Expect "Read as an article, link".
3. **Choose a cut.** Swipe to the cut choice. Expect each option read with
   its state. Double-tap "Read the full issue". Expect "Page 2 of N: …" read once,
   by its heading.
4. **Member-started turns.** With a three-finger swipe left (or the Next
   control), turn three pages. Expect each new page's heading read once
   (for example "Top shows, heading level 2"), and nothing from the live
   region on these turns.
5. **Automatic turns.** Leave autoplay running with focus on a heading for
   two turns. Expect "Page 6 of N: Top movies" (the live region) read once per
   turn, and focus to stay where it was.
6. **Pause.** Swipe to Pause, double-tap. Expect "Pause, button" before and
   the playing state to stop; no further turns.
7. **The quiz.** On the quiz page, expect a radio group with its question.
   Swipe through the tiles: each is read as a radio button with its title and
   "1 of 4". Double-tap one. Expect the result to be read once, and the
   correct tile's state.
8. **The Table sheet.** On a chart page (The number, the clock), double-tap
   "Table". Expect a dialog with its title; swipe through the table: column
   headers are read with each cell. Close it with the Close button (and with a
   two-finger scrub). Expect focus back on "Table".
9. **"Why this?".** On the centrefold, double-tap "Why this?". Expect the
   dialog's title, the reasons and the dedication. Close it; focus returns
   to "Why this?". On an issue with model-written words, Settings' "About
   the words" names the provider; an all-template issue has no such section.
10. **The share sheet.** Open Share. Expect each switch read as "switch
    button, on/off" with its label, and toggling read once. Double-tap Copy
    link (or "Create a public link…" then confirm). Expect the confirmation
    toast read once. Close the sheet.
11. **Close.** Double-tap "Close Rewind". Expect the page you came from, with
    focus on its main heading or the RewindCard.
12. **Article mode.** Open `/rewind/2026/read` (or "Read as an article").
    Expect the first focusable element to be "Play the story", the h1 "The
    2026 issue", then every section's h2 in order with the rotor. Tables read
    with headers.
13. **The share page.** Open a public link (`/rewind/s/<token>`) signed out.
    Expect a single h1, every page as a section with its heading, and no
    control that does nothing for a visitor.
14. **An archive article.** Open `/rewind/2025` for a member with a stored
    2025 year. Expect the article read as for step 12, with no story, cards
    or sharing.

## Script B: TalkBack on Android 16 Chrome

Swipe right or left moves between elements; double-tap activates; the
reading controls (swipe up then down) pick Headings. Confirm first that low-end
mode is on: in Chrome's remote DevTools, `[data-testid="rewind-scope"]` has
`data-low-end`, and the cover's nameplate stretches with a plain scale.

Run steps 1 to 14 of Script A, with these differences:

- Step 4: turn pages with the Next control (TalkBack has no three-finger
  swipe by default).
- Step 5: TalkBack may read the live region after it finishes the current
  element. Expect it read once, not twice.
- Step 8: close the sheet with the Back gesture too; focus returns to "Table".

## Results

Fill one row per step and device. Result is Pass, Fixed (commit), or Not a
defect (reason).

| Step | Device, OS, browser | Result | Notes |
| --- | --- | --- | --- |
| A1 | iPhone 15, iOS 26, Safari | | |
| A2 | | | |
| A3 | | | |
| A4 | | | |
| A5 | | | |
| A6 | | | |
| A7 | | | |
| A8 | | | |
| A9 | | | |
| A10 | | | |
| A11 | | | |
| A12 | | | |
| A13 | | | |
| A14 | | | |
| A1-A3, A12 | iPhone SE size, iOS 26, Safari | | |
| B1 | Moto G Power class, Android 16, Chrome | | |
| B2 | | | |
| B3 | | | |
| B4 | | | |
| B5 | | | |
| B6 | | | |
| B7 | | | |
| B8 | | | |
| B9 | | | |
| B10 | | | |
| B11 | | | |
| B12 | | | |
| B13 | | | |
| B14 | | | |
