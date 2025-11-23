import { redirect } from "next/navigation"

export default async function AdminDashboard() {
  // Redirect to users page - the main admin interface
  // Authorization check will happen on the target page
  redirect("/admin/users")
}

