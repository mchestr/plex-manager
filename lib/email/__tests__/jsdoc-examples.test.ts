/**
 * @jest-environment node
 */

import { escapeHtml } from "@/lib/email/html"

describe("JSDoc Documentation Examples", () => {
  it("escapeHtml matches its example", () => {
    expect(escapeHtml('<b>"Tom" & Jerry\'s</b>')).toBe("&lt;b&gt;&quot;Tom&quot; &amp; Jerry&#39;s&lt;/b&gt;")
  })
})
