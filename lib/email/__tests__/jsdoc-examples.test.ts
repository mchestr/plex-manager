/**
 * @jest-environment node
 */

import { escapeHtml } from "@/lib/email/html"
import { accessRemindersListId } from "@/lib/email/unsubscribe"

describe("JSDoc Documentation Examples", () => {
  it("escapeHtml matches its example", () => {
    expect(escapeHtml('<b>"Tom" & Jerry\'s</b>')).toBe("&lt;b&gt;&quot;Tom&quot; &amp; Jerry&#39;s&lt;/b&gt;")
  })

  it("accessRemindersListId matches its example", () => {
    expect(accessRemindersListId("Northfield Plex", "noreply@example.com")).toBe('"Northfield Plex access reminders" <access-reminders.example.com>')
  })
})
