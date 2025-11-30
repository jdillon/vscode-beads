---
description: Prepare and tag a new release
argument-hint: [version]
allowed-tools: Bash(git:*), Bash(jq:*), Read, Edit
model: sonnet
---

Prepare a release for the vscode-beads extension. This command:
1. Computes the default version based on branch
2. Audits changelog for missing entries
3. Finalizes changelog and bumps version
4. Commits, tags, and pushes to trigger the release workflow

## Instructions

### Step 1: Gather release context

Run these commands to understand the current state:

```bash
# Get current branch
git branch --show-current

# Get current version from package.json
jq -r .version package.json

# Get latest tag
git describe --tags --abbrev=0 2>/dev/null || echo "no tags yet"

# Get commits since last tag (for changelog audit)
git log $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~20")..HEAD --oneline --no-merges
```

### Step 2: Compute default version

Based on branch:
- `main` or other branches: bump minor version (e.g., 0.1.3 → 0.2.0)
- `release-v*` branch: bump patch version (e.g., 0.2.0 → 0.2.1)

If user provided a version argument ($ARGUMENTS), use that instead.

Present the computed version and ask user to confirm or provide override.

### Step 3: Audit changelog

Compare commits since last tag against CHANGELOG.md `[Unreleased]` section.

Flag commits that might need changelog entries:
- `feat:` commits → should be in "### Added" or "### Changed"
- `fix:` commits → should be in "### Fixed"
- Important `chore:` or `refactor:` that affect users

Skip (don't flag):
- `docs:`, `ci:`, `test:` commits
- Minor `chore:` commits (deps, formatting)
- Commits already referenced in changelog (check for bead IDs)

If gaps found, show them and ask user to update changelog first. Do NOT proceed until changelog is complete.

### Step 4: Validate and execute release

Once changelog is confirmed complete:

1. **Validate `[Unreleased]` has content** - fail if empty

2. **Update CHANGELOG.md**:
   - Replace `## [Unreleased]` with `## [X.Y.Z] - YYYY-MM-DD`
   - Add new empty `## [Unreleased]` section at top

3. **Update package.json version**

4. **Commit**: `chore: release vX.Y.Z`

5. **Create tag**: `vX.Y.Z`

6. **Push branch and tag**:
   ```bash
   git push origin <branch>
   git push origin vX.Y.Z
   ```

7. **Report success** with link to GitHub Actions to monitor the release workflow.

## Important

- Never proceed with empty changelog
- Always confirm version with user before executing
- The GitHub workflow triggers on tag push and handles publishing
