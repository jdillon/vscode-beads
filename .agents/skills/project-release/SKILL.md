---
name: project-release
description: Prepare and tag a new release
---

Prepare a release for the vscode-beads extension.

## Asking the user

Some steps below stop and require an answer before anything else runs. Each one
states its question and a fixed set of options.

Put those to the user through whatever your harness provides for asking a
multiple-choice question and blocking until the user picks one, presented as
selectable choices rather than free-form text. Claude Code calls this
`AskUserQuestion`; other harnesses have their own equivalent, so use theirs. If
yours has nothing like it, print the question and its options as plain text.

The mechanism is negotiable. Stopping is not. Do not run the next step, and do
not assume an answer, until the user has actually answered.

## Instructions

### Step 1: Gather release context

Run these commands:

```bash
git branch --show-current
jq -r .version package.json
git describe --tags --abbrev=0 2>/dev/null || echo "no tags yet"
git log $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~20")..HEAD --oneline --no-merges
```

### Step 2: Validate branch

Releases MUST be from `main` or `release-v*` branch.

- If on `main`: proceed (minor version bump)
- If on `release-v*`: proceed (patch version bump)
- If on ANY OTHER branch: **STOP** and tell user to merge to main first. Do NOT continue.

### Step 3: Compute version

Compute default version:
- `main` branch → bump minor, reset patch (e.g., 0.1.3 → 0.2.0)
- `release-v*` branch → bump patch only (e.g., 0.2.0 → 0.2.1)

If the user provided a version, use that instead.

**STOP HERE.** Ask, per "Asking the user" above:

- Question: "Which version for this release?"
- Options:
  - The computed version, marked as the recommended default
  - At least one plausible alternative (the other bump level)

Whatever the user picks becomes the release version.

### Step 4: Audit changelog for user-facing changes

Read CHANGELOG.md `[Unreleased]` section. Compare commits since last tag.

**Only flag commits that affect END USERS of the extension:**
- `feat:` that add/change extension UI, commands, or settings
- `fix:` that fix bugs users could encounter

**Always skip (never flag):**
- `docs:`, `ci:`, `test:`, `bd:`, `bd sync:` commits
- `chore:` commits (deps, formatting, tooling, project config)
- `feat:` or `fix:` in `.agents/`, `.claude/`, `.codex/`, `.github/`, `scripts/`, `docs/` (project tooling, not extension)
- Commits already referenced in changelog (matching bead ID like `vsbeads-xxx`)

If user-facing changes are missing from changelog, list them and **STOP**. Ask user to update changelog. Do NOT proceed.

If no gaps found, confirm changelog looks complete and proceed.

### Step 5: Verify the build locally

Pushing the tag is what publishes. `release.yml` runs these same gates, but a
failure there lands after the tag exists, and backing that out means deleting
and re-pushing a tag. Catch it here instead:

```bash
bun run lint
bun run test
bun run compile
```

If any of them fail, **STOP**. Report the failure and do not tag.

### Step 6: Execute release

Only proceed after the user confirmed the version, the changelog is complete,
and the local gates passed.

1. Validate `[Unreleased]` has content (fail if empty)

2. Update CHANGELOG.md:
   - Add `## [Unreleased]` with empty subsections at top
   - Change old `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`

3. Update package.json version field

4. Commit: `chore: release vX.Y.Z`

5. Create tag: `vX.Y.Z`

6. Push branch and tag:
   ```bash
   git push origin <branch>
   git push origin vX.Y.Z
   ```

7. Report success with link: https://github.com/jdillon/vscode-beads/actions
