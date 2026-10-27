# Admin settings: read-only first, with an Edit mode

**Status:** implemented on `claude/nifty-hamilton-8fdulz`. **Supersedes** the "always-open forms (no read-only/Edit toggle, `UI-31`)" rule of `ui-design-system.md` §6.4; the rule there now describes this pattern.

**Ask.** Make every settings section read-only by default, with an Edit toggle per section, so the page reads cleanly. Ground the design in established web guidance rather than taste.

**Why this does not reopen UI-31.** UI-31's complaint was *two* editing patterns side by side (some forms read-only with an Edit toggle, others always open, with a raw Edit button and toast-only errors). The fix was one pattern. This change keeps one pattern, applied to every section; it changes which one.

## Principles and their sources

1. **Show first, edit second.** A settings page's first job is to show the current configuration at a glance; editing is the exception. Saved values read as text in a description list, not as disabled or read-only inputs, which look editable, cannot be focused (disabled) and are exempt from contrast rules.
   - [GOV.UK Design System: Summary list](https://design-system.service.gov.uk/components/summary-list/) (key facts in a `<dl>`; card-level actions in the summary card header; "Change" links carry visually hidden text naming the row)
   - [Material Design 1: Settings](https://m1.material.io/patterns/settings.html) (users should "quickly see the most important or frequently used settings and their values")
   - [IBM Carbon: Read-only states](https://carbondesignsystem.com/patterns/read-only-states-pattern/), [Adrian Roselli: Avoid read-only controls](https://adrianroselli.com/2024/11/avoid-read-only-controls.html), [WCAG 2.2 SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
2. **Edit a whole section, not a field.** Our sections are multi-field forms with Test connection, so one Edit per card switches its summary to its form; per-field inline edit is for single values outside forms.
   - [PatternFly: Inline edit](https://www.patternfly.org/components/inline-edit/design-guidelines) ("Any editing is triggered by an edit link for the whole section"; Save and Cancel both return to read-only)
   - [Atlassian: Inline edit](https://atlassian.design/components/inline-edit/usage) ("Don't use inline edit inside of a form")
3. **Same layout in both modes.** Values swap for fields in place, in the same grid and order, so nothing jumps.
   - [Salesforce Lightning Design System: form element view mode](https://github.com/salesforce-ux/design-system/blob/master/ui/components/form-element/docs.mdx) ("The structure remains the same")
4. **Make the mode visible.** A mode needs more than one cue to avoid mode errors.
   - [NN/g: Modes in user interfaces](https://www.nngroup.com/articles/modes/) ("at least two visual indicators")
5. **One editor, one Save.** Only one section is open for editing at a time.
   - [Primer: Saving](https://primer.style/product/ui-patterns/saving/) ("Allow only one edit mode activated at a time"), [Shopify Polaris: Contextual save bar](https://raw.githubusercontent.com/Shopify/polaris/main/polaris.shopify.com/content/components/deprecated/contextual-save-bar.mdx) (avoid several editable forms at once)
6. **Saving is explicit and Save stays available.** Don't disable Save for an unchanged or invalid form; validate on submit and keep the input when a save fails.
   - [Primer: Edit](https://primer.style/product/scenario-patterns/edit) ("Keep the save button enabled even when the form is unchanged or invalid"), [Adrian Roselli: Don't disable form controls](https://adrianroselli.com/2024/02/dont-disable-form-controls.html)
7. **Never discard work silently, and only ask when there is work to lose.**
   - [Cloudscape: Unsaved changes](https://cloudscape.design/patterns/general/unsaved-changes/), [NN/g: Confirmation dialogs](https://www.nngroup.com/articles/confirmation-dialog/), [MDN: beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)
8. **Focus follows the user; results are announced.** Edit moves focus into the form; leaving returns it to Edit; status messages use a live region that exists before the message.
   - [WCAG 2.2 SC 2.4.3 Focus order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html), [SC 4.1.3 Status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), [SC 2.4.11 Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
9. **Repeated buttons name their section.** "Edit" stays the visible start of the name ("Edit Plex server").
   - [WCAG 2.2 SC 2.5.3 Label in name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html), GOV.UK Summary list (visually hidden text)
10. **Switches act at once; deferred booleans are checkboxes.**
    - [NN/g: Toggle-switch guidelines](https://www.nngroup.com/articles/toggle-switch-guidelines/) (switches "should take immediate effect"), [GitLab Pajamas: Toggle](https://design.gitlab.com/components/toggle) (not when a submit button is needed), [Primer: ToggleSwitch](https://primer.style/product/components/toggle-switch/guidelines/)
11. **Secrets are write-only; gaps and problems stay visible in view mode.** Show that a secret is saved and its last four, never the value; a blank field keeps the stored one.
    - [Vercel: Sensitive environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables), [Stripe: API keys](https://docs.stripe.com/keys), [NN/g: Visibility of system status](https://www.nngroup.com/articles/ten-usability-heuristics/)

## Decisions

| Question | Decision | Basis |
|---|---|---|
| How saved values show | `SettingsSummary` (`<dl>`, `div > dt + dd`) in the form's grid; "Not set" for gaps; URLs and IDs mono and never truncated; booleans "On"/"Off" | 1, 3 |
| Where Edit goes | The card header, top right, beside the status; `secondary sm`; "Edit" or "Set up" plus the section title as hidden text | 2, 9; GOV.UK summary cards |
| What stays in view mode | Status badge and "Checked ...", Test connection (tests the saved values), "Last saved", instant switches, status rows, last runs | 1, 11 |
| Mode cues | Card border in `primary-indicator`, an "Editing" badge in place of Edit, Cancel and Save; the form is a landmark named by the section | 4 |
| Save | Enabled while editing; clean Save closes with no server call; success returns to view with focus on Edit; failure stays open on the first invalid field. `blockedReason` (SEC-31 secret re-entry, Rewind's budget and date rules) still disables Save with its reason | 6, 8 |
| Cancel and Escape | Close at once when clean; when dirty, "Discard changes to <section>?" with Keep editing. Escape ignores keys a popup already handled | 7 |
| One at a time | Opening a section closes a clean one (clearing its draft and errors, as Cancel would); a dirty one stays open, and shows its nav pip, until saved or discarded, even if its changes are typed away by hand. A save that finishes after the admin moved on never pulls focus back | 5, 7, 8 |
| Unsaved work outside the page | `beforeunload` while any section is dirty, removed when none is | 7 |
| Nothing stored | "Not set up." and a "Set up" button; never an empty form on load | 1, 11 |
| Instant switches | AI features, Stripe Subscriptions, Allow Jellyfin sign-in stay live in both modes, outside any form, labelled "Takes effect at once."; Jellyfin's moved from its Sheet to its row | 10 |
| Other booleans | `Checkbox` in edit mode, saved with Save | 10 |
| List sections | Rows are the view, each row's Sheet the edit mode: Cancel, Save that closes the Sheet, the same discard question; an open Sheet's unsaved changes count as its section's for the nav pip and the leave prompt | 2, 7 |
| Unreadable secrets | View says "Can't be read with the current encryption key" with "Enter it again", which opens the form on that field | 11 |
| Setup wizard | Unchanged: it is a single-task flow where always-open forms are right; shared fields keep their markup and test ids | PatternFly (don't use edit mode when editing is the view's purpose) |

### Where this departs from the first draft of the spec

- **No cross-section dialog.** The draft opened A's discard dialog when Edit was pressed on B while A was dirty, even with A in a hidden settings group. A dirty section now simply stays open beside the new one; nothing is lost and no dialog appears about a section out of sight.
- **No "No changes to save." message.** A clean Save closes the form and focus lands on "Edit <section>", which already says what happened.
- **Rewind keeps `blockedReason`** for its budget and same-day date rules (Save disabled with the reason shown) rather than moving them to submit-time validation, which would have changed its tested behaviour for no gain.

## Risks and how the design meets them

| Risk | Mitigation |
|---|---|
| An extra click for frequent changes (PatternFly, Cloudscape) | Admin settings change rarely; the settings that change often are master on/off switches, and those stay one click. Edit focuses the first field. |
| Mode errors (NN/g) | Three visual cues, a named form landmark, the nav pip, and dirty guards. |
| A tidy summary hiding a broken service | Status badges, "Not set", "Not set up." and the unreadable-secret warning are part of the view; Test connection works without editing. |
| Focus lost when the focused button unmounts (Deque) | Focus is moved explicitly on every path; unit tests assert `activeElement`, and an E2E spec walks the keyboard path. |
| Mixing instant and explicit saving (Primer) | Exactly three instant controls, outside any form, each labelled; every switch inside a form became a checkbox. |
| View-first is a preference, not a correction (Shopify keeps settings always editable; no study compares the two) | The owner chose it; the design keeps Shopify's anatomy (heading plus one-line description) and keeps the added friction to one click. |

## Verification

- Unit: `components/ui/__tests__/settings-section.test.tsx` (modes, focus, Save, Cancel, Escape, one at a time, SEC-31), `settings-summary.test.tsx`, `hooks/admin/__tests__/use-settings-form.test.ts`, and each section's tests.
- E2E: `e2e/admin/settings-edit-mode.spec.ts` (keyboard path, discard question, one at a time), the updated `settings-layout`, `settings-secret-origin`, `settings-encryption`, `settings-rewind` and `production` specs.
- Accessibility: axe scans `/admin/settings` in view mode and with the Plex section in edit mode (`admin /admin/settings [plex editing]`), both at zero violations.
