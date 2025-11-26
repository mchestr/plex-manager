"use client"

import { AdminUserWithWrappedStats } from "@/types/admin"
import { UserTableRow } from "./user-table-row"

interface UsersListProps {
  users: AdminUserWithWrappedStats[]
  currentYear: number
}

export function UsersList({ users, currentYear }: UsersListProps) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/50 text-xs uppercase text-slate-400 font-medium border-b border-slate-700">
              <th className="px-2 py-2">User</th>
              <th className="px-2 py-2">Role</th>
              <th className="px-2 py-2">Access</th>
              <th className="px-2 py-2">LLM Cost</th>
              <th className="px-2 py-2">Joined</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <UserTableRow key={user.id} user={user} currentYear={currentYear} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

