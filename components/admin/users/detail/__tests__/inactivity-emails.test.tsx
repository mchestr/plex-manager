/**
 * The member page's warning email facts: the newest email (stage, day and
 * status) with the open cycle's removal date, or None, whether an address is
 * on file, and the member's Access reminders switch.
 */

import { render, screen } from "@testing-library/react"

import { InactivityEmails } from "@/components/admin/users/detail/inactivity-emails"
import type { MemberInactivityEmails } from "@/lib/data/member-inactivity"
import { bindFormat } from "@/lib/utils/format"

const f = bindFormat({ timeZone: "America/Chicago", locale: "en-US" })

function renderFacts(emails: MemberInactivityEmails) {
  render(
    <dl>
      <InactivityEmails emails={emails} f={f} />
    </dl>
  )
}

describe("InactivityEmails", () => {
  it("shows the newest email, its status and the removal date", () => {
    renderFacts({
      last: { leadDays: 1, lastWarning: true, status: "skipped", code: "unsubscribed", at: new Date("2026-11-19T15:00:00Z") },
      removalDay: "2026-11-20",
      emailOnFile: true,
      remindersOn: false,
    })

    expect(screen.getByTestId("admin-user-inactivity-emails")).toHaveTextContent(
      "Last warning, Nov 19, 2026Skipped (unsubscribed)Removal on or after Nov 20, 2026"
    )
    expect(screen.getByTestId("admin-user-inactivity-removal-date")).toHaveTextContent("Removal on or after Nov 20, 2026")
    expect(screen.getByTestId("admin-user-email-on-file")).toHaveTextContent(/^Yes$/)
    expect(screen.getByTestId("admin-user-access-reminders")).toHaveTextContent(/^Off$/)
  })

  it("says None before the first email, with no address on file and the reminders on", () => {
    renderFacts({ last: null, removalDay: null, emailOnFile: false, remindersOn: true })

    expect(screen.getByTestId("admin-user-inactivity-emails")).toHaveTextContent(/^None$/)
    expect(screen.queryByTestId("admin-user-inactivity-removal-date")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-user-email-on-file")).toHaveTextContent(/^No$/)
    expect(screen.getByTestId("admin-user-access-reminders")).toHaveTextContent(/^On$/)
  })
})
