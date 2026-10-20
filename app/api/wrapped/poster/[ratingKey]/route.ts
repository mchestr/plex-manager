/**
 * GET /api/wrapped/poster/[ratingKey]: the v2 viewer's poster URL, served by
 * the Rewind poster route (P5.6) until P11.29 deletes the v2 viewer. Without
 * `w` and `tone` it serves full colour at 480 px.
 */
export { GET } from "@/app/api/rewind/poster/[ratingKey]/route"

export const dynamic = "force-dynamic"
