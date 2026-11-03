import "server-only"

/**
 * Which listed documents belong to which skill. A skill's folder is the
 * directory of its `SKILL.md` as listed (`""` only at the repo root), and a
 * document belongs to the deepest skill folder that contains it, matched by
 * whole path segments, so nested skills keep their files apart.
 *
 * @module lib/chatbot/skills/folders
 */

/** Whether a listed path is a skill: its file name is exactly `SKILL.md`. */
export const isSkillFile = (path: string) => path.split("/").at(-1) === "SKILL.md"
/** The directory of a `SKILL.md` as listed, `""` at the repo root. */
export const skillFolder = (skillPath: string) => skillPath.split("/").slice(0, -1).join("/")
const depth = (folder: string) => (folder === "" ? 0 : folder.split("/").length)
const contains = (folder: string, doc: string) => folder === "" || doc.startsWith(`${folder}/`)

/**
 * Each skill folder's supporting documents, as paths relative to the folder,
 * sorted. Every one of `skillPaths` marks a folder, so a skill that is not
 * shown still keeps its files from the skill around it.
 */
export function assignFiles(docs: string[], skillPaths: string[]): Map<string, string[]> {
  const folders = skillPaths.map(skillFolder).sort((a, b) => depth(b) - depth(a))
  const files = new Map(folders.map((folder) => [folder, [] as string[]]))

  for (const doc of docs) {
    if (isSkillFile(doc)) continue
    const folder = folders.find((candidate) => contains(candidate, doc))
    if (folder !== undefined) files.get(folder)?.push(folder ? doc.slice(folder.length + 1) : doc)
  }
  for (const paths of files.values()) paths.sort((a, b) => (a < b ? -1 : 1))
  return files
}
