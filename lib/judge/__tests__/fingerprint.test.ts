/**
 * @jest-environment node
 */

/**
 * The finding fingerprint (spec §3, "Fingerprint"): sha256 of the structured
 * fields only, so a reworded claim on the same message still matches.
 */

import { fingerprintOf } from "../fingerprint"

describe("fingerprintOf", () => {
  it("is stable for equal input", () => {
    const input = { type: "wrong_fact", tool: "get_users", messageId: "msg-1" }
    expect(fingerprintOf(input)).toBe(fingerprintOf({ ...input }))
    expect(fingerprintOf(input)).toMatch(/^[0-9a-f]{64}$/)
  })

  it("differs when the tool differs", () => {
    const input = { type: "wrong_fact", tool: "get_users", messageId: "msg-1" }
    expect(fingerprintOf(input)).not.toBe(fingerprintOf({ ...input, tool: "get_invites" }))
  })

  it("equal type/tool/messageId give equal fingerprints whatever the claim", () => {
    const first = { type: "wrong_fact", tool: "get_users", messageId: "msg-1", claim: "Says 12 members." }
    const second = { type: "wrong_fact", tool: "get_users", messageId: "msg-1", claim: "The member count is wrong." }
    const pick = ({ type, tool, messageId }: typeof first) => ({ type, tool, messageId })
    expect(fingerprintOf(pick(first))).toBe(fingerprintOf(pick(second)))
  })
})
