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
    const properNouns = /\b(?:Plex|Rewinds?|Discord|Stripe|LLM|MCP|Leaving soon)\b/g

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
    [AuditEventType.MCP_TOOL_CALLED, "Tool used through MCP", "api"],
    [AuditEventType.API_TOKEN_CREATED, "MCP token made", "api"],
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

describe("the media cleanup events (TS 11.2)", () => {
  it("files them under their own category, after Plex access", () => {
    expect(AUDIT_CATEGORIES.slice(0, 3)).toEqual(["members", "access", "cleanup"])
    expect(CATEGORY_LABELS.cleanup).toBe("Media cleanup")
  })

  const LABELS: [AuditEventType, string][] = [
    [AuditEventType.CLEANUP_RULE_CREATED, "Cleanup rule created"],
    [AuditEventType.CLEANUP_RULE_CHANGED, "Cleanup rule changed"],
    [AuditEventType.CLEANUP_RULE_DELETED, "Cleanup rule deleted"],
    [AuditEventType.CLEANUP_RULE_MODE_CHANGED, "Cleanup rule mode changed"],
    [AuditEventType.CLEANUP_SETTINGS_CHANGED, "Media cleanup settings changed"],
    [AuditEventType.CLEANUP_PAUSED, "Media cleanup paused"],
    [AuditEventType.CLEANUP_RESUMED, "Media cleanup resumed"],
    [AuditEventType.CLEANUP_RUN_STARTED, "Media cleanup run started"],
    [AuditEventType.CLEANUP_RUN, "Media cleanup ran"],
    [AuditEventType.CLEANUP_ITEMS_ENTERED, "Titles joined Leaving soon"],
    [AuditEventType.CLEANUP_ITEMS_HELD, "New matches held for review"],
    [AuditEventType.CLEANUP_ITEMS_RELEASED, "Titles released from Leaving soon"],
    [AuditEventType.CLEANUP_BATCH_APPROVED, "Cleanup batch approved"],
    [AuditEventType.CLEANUP_ITEMS_POSTPONED, "Leave dates postponed"],
    [AuditEventType.CLEANUP_ITEMS_EXCLUDED, "Titles excluded from cleanup"],
    [AuditEventType.CLEANUP_EXCLUSION_CHANGED, "Cleanup exclusion changed"],
    [AuditEventType.CLEANUP_KEEP_ADDED, "Title kept by a member"],
    [AuditEventType.CLEANUP_KEEP_ENDED, "Keep ended"],
    [AuditEventType.CLEANUP_ITEM_RESCUED, "Title rescued from Leaving soon"],
    [AuditEventType.CLEANUP_ITEM_DELETED, "Title deleted by cleanup"],
    [AuditEventType.CLEANUP_ITEM_FAILED, "Cleanup deletion failed"],
  ]

  it.each(LABELS)("labels %s", (type, label) => {
    expect(eventLabel(type)).toBe(label)
    expect(eventCategory(type)).toBe("cleanup")
  })

  it("lists all 21 of them, in the order of TS 11.1, and nothing else in the category", () => {
    expect(typesIn("cleanup")).toEqual(LABELS.map(([type]) => type))
  })
})

describe("typesIn", () => {
  it("lists the inactivity sweep's events with access", () => {
    expect(typesIn("access")).toEqual([
      "MEMBER_UNSHARED",
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
