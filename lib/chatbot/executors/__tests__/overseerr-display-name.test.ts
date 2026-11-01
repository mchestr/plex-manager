/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}))

import { displayName } from "../overseerr-projections"

describe("displayName", () => {
  it.each([
    // Overseerr falls back to the email of a user with no username, so any word that is one hides the name
    ["sam@example.invalid", "user 7"],
    ["Sam <sam@example.invalid>", "user 7"],
    ["contact: sam@mail.example.co.uk today", "user 7"],
    ["Sam Smith", "Sam Smith"],
    ["@sam", "@sam"],
    ["sam@home", "sam@home"],
    ["sam@example.", "sam@example."],
  ])("reads %s as %s", (name, shown) => {
    expect(displayName({ id: 7, displayName: name })).toBe(shown)
  })

  // An unanchored /[^\s@]+@[^\s@]+\.[^\s@]+/ retried from every character of a long name: quadratic
  it.each([
    ["a run with no @", "a".repeat(100_000)],
    ["a run before many @ and dots", `${"\u0000".repeat(50_000)}${".@".repeat(25_000)}`],
    ["words with an @ and no dot", "a@b ".repeat(25_000)],
  ])("reads %s of 100,000 characters in well under 100 ms", (_case, name) => {
    const start = performance.now()
    displayName({ id: 7, displayName: name })
    expect(performance.now() - start).toBeLessThan(100)
  })
})
