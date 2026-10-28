/**
 * @jest-environment node
 */

import { titleFrom } from "@/lib/chatbot/history"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

describe("JSDoc Documentation Examples", () => {
  it("titleFrom", () => {
    expect(titleFrom("  Why is   Plex buffering?\n")).toBe("Why is Plex buffering?")
  })
})
