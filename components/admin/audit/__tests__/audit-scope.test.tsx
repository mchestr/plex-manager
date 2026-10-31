/**
 * The audit log's scope chips: one per person, member or run the log is
 * limited to, each with a link that removes it and keeps every other filter.
 */

import { render, screen } from "@testing-library/react"

import { AuditScope } from "@/components/admin/audit/audit-scope"

const JANE = { id: "jane", kind: "user", name: "Jane Doe" } as const
const SYSTEM = { id: "system", kind: "system", name: "System" } as const

describe("AuditScope", () => {
  it("shows nothing when the log is not scoped", () => {
    const { container } = render(<AuditScope params={{ category: "access" }} actor={null} member={null} run={null} />)

    expect(container).toBeEmptyDOMElement()
  })

  it("names the person, the member and the run, in that order", () => {
    render(<AuditScope params={{ actor: "system", member: "jane", run: "run-1" }} actor={SYSTEM} member={JANE} run="run-1" />)

    expect(screen.getByTestId("admin-audit-scope")).toHaveTextContent("By SystemInvolving Jane DoeOne inactivity run")
    expect(screen.getByTestId("admin-audit-scope-actor")).toHaveTextContent("By System")
    expect(screen.getByTestId("admin-audit-scope-member")).toHaveTextContent("Involving Jane Doe")
    expect(screen.getByTestId("admin-audit-scope-run")).toHaveTextContent("One inactivity run")
  })

  it("removes one scope, keeping the other filters and going back to page 1", () => {
    const params = { actor: "system", member: "jane", run: "run-1", category: "access", page: "4", pageSize: "50" }
    render(<AuditScope params={params} actor={SYSTEM} member={JANE} run="run-1" />)

    expect(screen.getByTestId("admin-audit-scope-actor-clear")).toHaveAttribute("href", "/admin/audit?member=jane&run=run-1&category=access&pageSize=50")
    expect(screen.getByTestId("admin-audit-scope-member-clear")).toHaveAttribute("href", "/admin/audit?actor=system&run=run-1&category=access&pageSize=50")
    expect(screen.getByTestId("admin-audit-scope-run-clear")).toHaveAttribute("href", "/admin/audit?actor=system&member=jane&category=access&pageSize=50")
    expect(screen.getByTestId("admin-audit-scope-member-clear")).toHaveAccessibleName('Remove "Involving Jane Doe"')
  })
})
