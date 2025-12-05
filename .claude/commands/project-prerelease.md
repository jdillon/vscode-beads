---
description: Audit changelog and draft entries for upcoming release
allowed-tools: Bash(git:*), Bash(jq:*), Read, Edit, Grep, AskUserQuestion, mcp__plugin_beads_beads__list, mcp__plugin_beads_beads__show
model: haiku
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
- The change is in: `.claude/`, `.github/`, `scripts/`, `docs/`, `.beads/`
- The bead ID is already in CHANGELOG.md
- The change is infrastructure/tooling (build scripts, CI workflows, slash commands)

**Examples:**

| Commit | Decision | Why |
|--------|----------|-----|
| `feat(ui): add dark mode toggle` | INCLUDE | User-facing UI feature |
| `fix: button not clickable` | INCLUDE | User-facing bug fix |
| `docs: update README` | SKIP | Documentation only |
| `feat: add /release command` | SKIP | Project tooling in .claude/ |
| `chore: update dependencies` | SKIP | Not user-facing |
| `fix(ci): repair workflow` | SKIP | CI/infrastructure |

### Step 4: Get bead details

Use `mcp__plugin_beads_beads__list` with `status=closed` and `limit=20` to get recently closed beads.

For each bead ID found in commits (from Step 2), use `mcp__plugin_beads_beads__show` to get the title and type.

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

### Step 7: Present report to user

Show this information clearly:

1. **Commits analyzed** - table with: commit hash, type, INCLUDE/SKIP, reason
2. **Beads referenced** - list with: bead ID, title, type (feature/bug/task)
3. **Gaps detected** - any closed beads missing from commits (or "None")
4. **Draft entries** - the changelog entries grouped by section

### Step 8: Ask for confirmation

**IMPORTANT:** You MUST use the `AskUserQuestion` tool here. Do not proceed without user confirmation.

Use `AskUserQuestion` tool with:
- Question: "Update CHANGELOG.md with these entries?"
- Header: "Changelog"
- Options:
  - Label: "Yes, update" / Description: "Merge entries into [Unreleased] section"
  - Label: "No, skip" / Description: "Stop without making changes"
- multiSelect: false

Wait for the user's response before proceeding to Step 9.

### Step 9: Update CHANGELOG.md (only if user said yes)

1. Read CHANGELOG.md
2. Find `## [Unreleased]`
3. Insert new entries AFTER `## [Unreleased]` and BEFORE the next `## [x.y.z]` section
4. If `[Unreleased]` already has entries, merge (don't duplicate)
5. Use the Edit tool to make the change
6. Do NOT commit
7. Tell user: "CHANGELOG.md updated. Review with `git diff CHANGELOG.md`"

If user said no, just stop - don't make any changes.
