---
name: pr-writing
description: A final prose pass for text people read on GitHub and in the docs (pull request titles and bodies, issues, review replies, changelog fragments, operator docs). Use before creating or updating a pull request or issue, when writing a changelog fragment, or when asked to make writing plainer or less machine-sounding. Not for code, logs, commands, quotations or machine-read files.
paths:
  - ".github/**"
  - "changelog.d/**"
  - "docs/**"
---

# PR writing

Write for a reviewer who was not in the session. Accuracy comes before style:
a plainer sentence that changes a fact is worse than the original.

## Decide what goes in

1. The outcome first: what changes for a member, an admin or an operator, in
   one or two plain sentences.
2. Why: the problem on its own terms (what breaks or is missing, who it
   affects), not "as requested".
3. What a reviewer needs to judge it: the risk, the decision a reader might
   question, how it was checked, and what was left out on purpose.
4. Fill the headings of `.github/pull_request_template.md` and tick only the
   checklist items that are true.

Leave out what the reader already has or does not need:

- a file-by-file restatement of the diff;
- the working history (what was tried first, how a bug was found) unless it
  changes how to review the result;
- full command output; quote the line that matters;
- names coined during the work that appear nowhere in the code or docs.

## Keep it public-safe

Pull requests, issues, comments and commit messages are public. Before posting,
remove private hostnames and domains, IP addresses, Tailscale names, local
absolute paths, worktree or session ids, member names, emails, Plex usernames
and watch history. Use neutral placeholders (`plex.example.com`, `<member>`)
where context is needed. Never paste a token, API key or a value from `.env`.

## Rewrite pass

- Keep meaning, numbers, uncertainty and scope. Keep a hedge that reflects a
  real gap in the evidence.
- Keep code, commands, identifiers, error text and quotations exact.
- Cut stock openers and closers, praise, promotional adjectives and claims
  such as "robust", "seamless" or "significantly" that no number supports.
- Replace a vague phrase with the mechanism, number or action behind it.
- One name per concept; use the codebase's terms (Rewind, member, admin,
  Support role) and do not cycle synonyms.
- Active voice, plain words, sentence-case headings. Use a list only where the
  items are parallel; avoid bold labels that repeat the sentence after them.
- Vary sentence length; split a sentence the reader has to read twice.

## Final check

1. Could a paragraph appear unchanged in an unrelated project? Make it
   specific or cut it.
2. Does the first paragraph make sense to someone who has not read the diff?
3. Did the edit change a fact, a quote or a confidence level? Restore it.
4. Is anything private left in the text or an attachment?

When asked only to rewrite, return the revised text without commentary.
