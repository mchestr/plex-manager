/**
 * A GitHub repository read by the admin assistant, as the knowledge base and
 * skill source forms take it: the repository, the ref and the folder.
 *
 * @module lib/validations/github-source
 */

import { z } from "zod"

/** `owner/name`, with no part made only of dots, so it cannot climb out of `/repos/`. */
export const githubRepo = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Use owner/name, for example mchestr/knowledgebase")
  .refine((value) => value.split("/").every((part) => !/^\.+$/.test(part)), "Use owner/name, for example mchestr/knowledgebase")

/** A branch, tag or commit SHA. */
export const githubRef = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_./-]+$/, "Use a branch, tag or commit")

/** A folder in the repository; empty means the whole repository. */
export const githubPath = z.string().trim().max(200).regex(/^[A-Za-z0-9_./ -]*$/, "Use a folder path")
