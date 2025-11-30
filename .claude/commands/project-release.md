---
description: Prepare and tag a new release
argument-hint: [version]
allowed-tools: Bash(git:*), Bash(jq:*), Read, Edit
model: sonnet
---

Prepare a release for the vscode-beads extension.

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

If user provided version argument ($ARGUMENTS), use that instead.

**STOP HERE.** Present the version and ask user to confirm or provide override. Wait for explicit confirmation before continuing.

### Step 4: Audit changelog for user-facing changes

Read CHANGELOG.md `[Unreleased]` section. Compare commits since last tag.

**Only flag commits that affect END USERS of the extension:**
- `feat:` that add/change extension UI, commands, or settings
- `fix:` that fix bugs users could encounter

**Always skip (never flag):**
- `docs:`, `ci:`, `test:`, `bd:`, `bd sync:` commits
- `chore:` commits (deps, formatting, tooling, project config)
- `feat:` or `fix:` in `.claude/`, `.github/`, `scripts/`, `docs/` (project tooling, not extension)
- Commits already referenced in changelog (matching bead ID like `vsbeads-xxx`)

If user-facing changes are missing from changelog, list them and **STOP**. Ask user to update changelog. Do NOT proceed.

If no gaps found, confirm changelog looks complete and proceed.

### Step 5: Execute release

Only proceed after user confirmed version AND changelog is complete.

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
