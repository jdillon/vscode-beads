# Third-Party PR Contributor Workflow

How to handle external PRs that need fixes while preserving contributor credit.

## When to Use

- PR has good changes but needs fixes (typos, security, style)
- Contributor is unresponsive or you want to move faster
- You want to preserve their commit history in the new PR

## Workflow

### 1. Fetch the PR locally

```bash
gh pr view <PR_NUMBER> --json headRefOid  # Get commit SHA
git fetch origin pull/<PR_NUMBER>/head:pr-<PR_NUMBER>
```

### 2. Create branch and cherry-pick their commit(s)

```bash
git checkout -b feat/descriptive-name main
git cherry-pick <COMMIT_SHA>  # Preserves their authorship
```

### 3. Add fix commit on top

Make your fixes, then commit:

```bash
git add -A
git commit -m "fix: description of fixes

- Fix 1
- Fix 2

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

### 4. Push and create new PR

```bash
git push -u origin feat/descriptive-name
gh pr create --title "feat: description" --body "..."
```

Reference the original PR in the body:

```markdown
Based on #<ORIGINAL_PR> by @<username> - thank you for the contribution!

## Commits

1. **abc123** - Original contribution by @username
2. **def456** - Fixes applied on top

## Fixes applied

| Issue              | Resolution |
| ------------------ | ---------- |
| Typo in comment    | Fixed      |
| Missing validation | Added      |
```

### 5. Comment and close original PR

```bash
gh pr comment <ORIGINAL_PR> --body "Thanks for this contribution, @username!

I've incorporated your changes into #<NEW_PR> with a few fixes:
- Fix 1
- Fix 2

Your commit is preserved in the PR history with full authorship credit. 🙏"

gh pr close <ORIGINAL_PR>
```

### 6. Squash merge with Co-Authored-By

When merging, include the contributor in the commit message:

```bash
gh pr merge <NEW_PR> --squash --body "Description of changes...

Co-Authored-By: Name <email@example.com>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Get contributor email from their commit:

```bash
git log pr-<PR_NUMBER> -1 --format='%an <%ae>'
```

## Why This Approach

| Concern             | Solution                                         |
| ------------------- | ------------------------------------------------ |
| Contributor credit  | `Co-Authored-By` trailer in squash commit        |
| Visibility of fixes | Separate commit in PR shows exactly what changed |
| Clean history       | Squash merge keeps main branch tidy              |
| Kindness            | Comment thanks them and explains changes         |

## Changelog Attribution

When adding contributor changes to CHANGELOG.md, include PR link and linked username:

```markdown
- Feature description ([#PR](https://github.com/OWNER/REPO/pull/PR) by [@user](https://github.com/user))
```

**Format:**

- Link to the merged PR (not the original if different)
- Link username to their GitHub/GitLab profile
- No bead ID needed if it's a community contribution without one

**Example:**

```markdown
### Added

- Fancy new feature ([#30](https://github.com/owner/repo/pull/123) by [@contributor](https://github.com/contributor))
```

## Alternative: Request Changes

If fixes are minor and contributor is active, just request changes on their PR. Use this workflow when:

- Contributor is unresponsive
- You need to move quickly
- Fixes are significant enough to warrant review
