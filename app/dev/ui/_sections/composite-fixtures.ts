/** Fixtures for the composites panel: 7 members and 120 plays, fixed so the visual baseline holds still. */

export interface FixtureUser {
  id: string
  name: string
  email: string
  role: "Owner" | "Admin" | "Member"
  access: "allowed" | "unknown" | "removed"
  plays: number
}

export const USERS: FixtureUser[] = [
  { id: "u1", name: "Dana Whitfield", email: "dana@example.com", role: "Owner", access: "allowed", plays: 412 },
  { id: "u2", name: "Morgan Lee", email: "morgan@example.com", role: "Admin", access: "allowed", plays: 288 },
  { id: "u3", name: "Sam Rivera", email: "sam@example.com", role: "Member", access: "unknown", plays: 175 },
  { id: "u4", name: "Priya Natarajan", email: "priya@example.com", role: "Member", access: "allowed", plays: 143 },
  { id: "u5", name: "Jordan Smith", email: "jordan@example.com", role: "Member", access: "unknown", plays: 96 },
  { id: "u6", name: "Alex Chen", email: "alex@example.com", role: "Member", access: "allowed", plays: 61 },
  { id: "u7", name: "Riley Okafor", email: "riley@example.com", role: "Member", access: "removed", plays: 12 },
]

export interface FixturePlay {
  id: string
  title: string
  kind: "movie" | "episode"
  member: string
  /** The play's start as an ISO instant. */
  playedAt: string
  minutes: number
}

const TITLES = [
  "The Long Field",
  "Northern Lights",
  "Paper Moons",
  "Harbour Nights",
  "Signal and Noise",
  "Orchard Road",
  "The Quiet Year",
  "Copper Valley",
  "Glass Houses",
  "Winter Ferry",
  "Low Tide",
  "The Last Archive",
]

/** 120 plays from 1 June 2026, one every 31 hours and 7 minutes. */
export const PLAYS: FixturePlay[] = Array.from({ length: 120 }, (_, index) => {
  const kind = index % 3 === 0 ? "movie" : "episode"
  return {
    id: `p${index + 1}`,
    title: kind === "movie" ? TITLES[index % TITLES.length] : `${TITLES[index % TITLES.length]}, episode ${(index % 9) + 1}`,
    kind,
    member: USERS[index % USERS.length].name,
    playedAt: new Date(Date.UTC(2026, 5, 1, 18) + index * (31 * 60 + 7) * 60_000).toISOString(),
    minutes: kind === "movie" ? 88 + ((index * 7) % 60) : 22 + ((index * 5) % 40),
  }
})

export const FIXTURE_ZONE = "America/Los_Angeles"
export const FIXTURE_SEASON = { from: "2026-01-01", to: "2026-11-30" }
