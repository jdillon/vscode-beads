---
name: project-prerelease
description: Audit changelog and draft entries for upcoming release
---

Audit the changelog for missing entries since the last release and draft updates.

## Instructions

Follow these steps exactly in order.

### Step 1: Get the last release tag

Run this command:
```bash
git describe --tags --abbrev=0 2>/dev/null || echo "no tags yet"
```

Save the result (e.g., `v0.2.0`) - you'll use it in the next commands.

Get the tag timestamp in RFC3339 form:
```bash
git log -1 --format=%cI <TAG>
```

Save this as `<TAG_DATE>` for the closed-bead query in Step 4.

### Step 2: Get commits and bead IDs since the tag

Run these commands, replacing `<TAG>` with the actual tag from Step 1:
```bash
git log <TAG>..HEAD --oneline --no-merges
git log <TAG>..HEAD --format="%B" --no-merges | grep -oE "vsbeads-[a-z0-9]+" | sort -u
```

**IMPORTANT:** Do NOT use nested `$(...)` command substitution - it causes zsh parse errors.

Also read CHANGELOG.md to see the current `[Unreleased]` section.

### Step 3: Categorize each commit

For EACH commit, decide: **INCLUDE** or **SKIP**?

**INCLUDE if ALL of these are true:**
- Commit type is `feat:` or `fix:`
- The change affects what users see/experience in the VS Code extension
- Examples: UI changes, new commands, bug fixes users would notice

**SKIP if ANY of these are true:**
- Commit type is: `docs:`, `ci:`, `test:`, `chore:`, `bd:`, `bd sync:`, `refactor:`
- The change is in: `.agents/`, `.claude/`, `.codex/`, `.github/`, `scripts/`, `docs/`, `.beads/`
- The bead ID is already in CHANGELOG.md
- The change is infrastructure/tooling (build scripts, CI workflows, agent skills)

**Examples:**

| Commit | Decision | Why |
|--------|----------|-----|
| `feat(ui): add dark mode toggle` | INCLUDE | User-facing UI feature |
| `fix: button not clickable` | INCLUDE | User-facing bug fix |
| `docs: update README` | SKIP | Documentation only |
| `feat: add release skill` | SKIP | Project tooling in .agents/ |
| `chore: update dependencies` | SKIP | Not user-facing |
| `fix(ci): repair workflow` | SKIP | CI/infrastructure |

### Step 4: Get bead details

Run the following command, replacing `<TAG_DATE>` with the timestamp from Step
1, to get every bead closed since the release tag:

```bash
bd list --status closed --closed-after <TAG_DATE> --limit 0 --json
```

For each bead ID found in commits, run `bd show <id> --json` to get its title
and type.

**Hints for non-user-facing beads** (use as signals, not absolute rules):
- Labels like `infra`, `dx`, `ci`, `docs` suggest internal work
- Beads about "workflow", "slash command", "CI", "build" are usually internal
- Still check the actual description to confirm

### Step 5: Check for gaps

Compare:
- Beads closed since the tag date
- Beads referenced in commits

If a user-facing bead was closed but NOT in any commit, flag it as a potential gap.

### Step 6: Write draft changelog entries

Format rules:
- One line per entry, max 80 characters
- Start with verb: "Add", "Fix", "Change", "Remove"
- Include bead ID at end: `(\`vsbeads-xxx\`)`
- Group by section: Added, Changed, Fixed, Removed

**Good examples:**
```
- Add colored dropdowns for type/status/priority in edit mode (`vsbeads-fwp`)
- Fix filter overlay staying fixed when scrolling (`vsbeads-eeg`)
```

**Bad examples (too long/verbose):**
```
- Added a new feature that allows users to see colored dropdown menus when editing the type, status, and priority fields in the Details view panel
```

### Step 7: Check README.md and draft updates

Read README.md and compare the Features section against the draft changelog entries.

**Flag as needing updates if:**
- New features in changelog aren't reflected in README Features section
- README mentions capabilities that have changed significantly
- Installation section is missing new distribution channels
- Commands or Settings tables are outdated

If README needs updates, draft specific changes:
- List each section that needs updating
- Show the current text and proposed replacement
- Keep changes minimal and focused on new features

### Step 8: Present report to user

Show this information clearly:

1. **Commits analyzed** - table with: commit hash, type, INCLUDE/SKIP, reason
2. **Beads referenced** - list with: bead ID, title, type (feature/bug/task)
3. **Gaps detected** - any closed beads missing from commits (or "None")
4. **Draft changelog entries** - the changelog entries grouped by section
5. **README updates needed** - "Up to date" or list specific proposed changes

### Step 9: Ask for changelog confirmation

Ask the user whether to update `CHANGELOG.md` with the proposed entries. Do not
proceed without confirmation.

### Step 10: Update CHANGELOG.md (only if user said yes)

1. Read CHANGELOG.md
2. Find `## [Unreleased]`
3. Insert new entries AFTER `## [Unreleased]` and BEFORE the next `## [x.y.z]` section
4. If `[Unreleased]` already has entries, merge (don't duplicate)
5. Edit the file without changing unrelated content
6. Do NOT commit
7. Tell user: "CHANGELOG.md updated. Review with `git diff CHANGELOG.md`"

### Step 11: Ask for README confirmation (only if updates needed)

If README updates were proposed in Step 7, ask the user whether to apply them.
Do not proceed without confirmation.

If README is up to date, skip this step.

### Step 12: Update README.md (only if user said yes)

1. Apply the proposed changes from Step 7
2. Edit the file without changing unrelated content
3. Do NOT commit
4. Tell user: "README.md updated. Review with `git diff README.md`"

If user said no or no updates needed, skip this step.
