/**
 * The pages a member's issue omits and the edition they get (design 4.3,
 * 4.5), for the golden facts test. The rules live in the v3 pipeline
 * (`lib/wrapped/pipeline/edition.ts`, P5.9), so the goldens pin what members
 * get; P5.5's registry `select()` takes them over.
 */

export { editionOf, omittedPages } from "@/lib/wrapped/pipeline/edition"
