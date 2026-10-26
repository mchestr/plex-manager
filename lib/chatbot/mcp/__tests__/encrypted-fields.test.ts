/**
 * @jest-environment node
 */

import { ENCRYPTED_FIELDS } from "@/lib/db/encrypted-fields"

describe("assistant source secrets", () => {
  it("are registered as encrypted at rest", () => {
    expect(ENCRYPTED_FIELDS.McpServer).toEqual(["authHeaderSecret"])
    expect(ENCRYPTED_FIELDS.KnowledgeSource).toEqual(["token"])
  })
})
