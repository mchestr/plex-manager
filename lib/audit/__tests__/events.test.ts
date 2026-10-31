/**
 * @jest-environment node
 */

/**
 * The audit log's words for each event type: a label and a category for every
 * member of the enum, retired ones included, and the raw string for a stored
 * type the enum does not know.
 */

import {
  AUDIT_CATEGORIES,
  AUDIT_EVENT_NAMES,
  CATEGORY_LABELS,
  eventCategory,
  eventLabel,
  isKnownEventType,
  typesIn,
} from "@/lib/audit/events"
import { AuditEventType } from "@/lib/security/audit-log"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

describe("the event table", () => {
  it("knows every member of the enum, and nothing else", () => {
    expect([...AUDIT_EVENT_NAMES].sort()).toEqual(Object.values(AuditEventType).sort())
  })

  it("gives each event its own short, sentence-case label", () => {
    const labels = AUDIT_EVENT_NAMES.map(eventLabel)
    const properNouns = /\b(?:Plex|Jellyfin|Rewinds?|Discord|Stripe|LLM|MCP)\b/g

    expect(new Set(labels).size).toBe(labels.length)
    for (const label of labels) {
      const rest = label.replace(properNouns, "x").slice(1)
      expect(label[0]).toBe(label[0].toUpperCase())
      expect(rest).toBe(rest.toLowerCase())
      expect(label.length).toBeLessThanOrEqual(40)
      expect(label).not.toMatch(/Wrapped|->|→| · /)
    }
  })

  it("files every event under a category, and every category holds an event", () => {
    for (const category of AUDIT_CATEGORIES) {
      expect(CATEGORY_LABELS[category]).toEqual(expect.any(String))
      expect(typesIn(category).length).toBeGreaterThan(0)
    }
    expect(AUDIT_CATEGORIES.flatMap(typesIn).sort()).toEqual([...AUDIT_EVENT_NAMES].sort())
  })
})

describe("eventLabel and eventCategory", () => {
  it.each([
    [AuditEventType.MEMBER_UNSHARED, "Plex access removed", "access"],
    [AuditEventType.INACTIVITY_SWEEP_RUN, "Inactivity sweep ran", "access"],
    [AuditEventType.INACTIVITY_SETTINGS_CHANGED, "Inactivity settings changed", "settings"],
    [AuditEventType.SESSIONS_REVOKED, "Signed out everywhere", "sessions"],
    [AuditEventType.AUDIT_LOG_VIEWED, "Audit log opened", "reads"],
    [AuditEventType.MEMBER_CONTENT_VIEWED, "Member's content opened", "reads"],
    // Retired, but stored rows still carry it
    [AuditEventType.LLM_PROVIDER_CHANGED, "LLM provider changed", "settings"],
  ])("labels %s", (type, label, category) => {
    expect(eventLabel(type)).toBe(label)
    expect(eventCategory(type)).toBe(category)
  })

  it("shows a stored type the enum does not know as it is, with no category", () => {
    expect(isKnownEventType("TEST")).toBe(false)
    expect(eventLabel("TEST")).toBe("TEST")
    expect(eventCategory("TEST")).toBeNull()
  })

  it("does not take an inherited property for an event type", () => {
    expect(isKnownEventType("constructor")).toBe(false)
    expect(eventLabel("toString")).toBe("toString")
    expect(eventCategory("__proto__")).toBeNull()
  })
})

describe("typesIn", () => {
  it("lists the inactivity sweep's events with access", () => {
    expect(typesIn("access")).toEqual([
      "MEMBER_UNSHARED",
      "JELLYFIN_ACCESS_DISABLED",
      "JELLYFIN_ACCESS_ENABLED",
      "INACTIVITY_SWEEP_RUN",
      "INACTIVITY_EXCLUSION_CHANGED",
      "ACTIVITY_SYNC_TRIGGERED",
    ])
  })

  it("lists the admin reads", () => {
    expect(typesIn("reads")).toEqual([
      "MEMBER_CONTENT_VIEWED",
      "MEMBER_CONTENT_LISTED",
      "REWIND_ADMIN_VIEWED",
      "ASSISTANT_DATA_READ",
      "AUDIT_LOG_VIEWED",
    ])
  })
})
