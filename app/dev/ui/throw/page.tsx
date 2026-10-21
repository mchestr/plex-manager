import type { Metadata } from "next"
import { connection } from "next/server"
import { notFound } from "next/navigation"

import { getEnv } from "@/lib/env"

export const metadata: Metadata = { robots: { index: false, follow: false } }

/** The message the boundary must never show (SEC-20); e2e/status-screens.spec.ts looks for it. */
const SECRET_MESSAGE = "Can't reach database server at db:5432"

/**
 * Throws during render, so the root error boundary shows. In a production
 * build the browser gets only a digest, and the server log has the full
 * error (P10.17). Off unless `ENABLE_DEV_UI=1`.
 */
export default async function DevThrowPage() {
  await connection()
  if (getEnv().ENABLE_DEV_UI !== "1") notFound()
  throw new Error(SECRET_MESSAGE)
}
