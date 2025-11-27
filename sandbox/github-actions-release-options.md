# GitHub Actions Release Options

## Current Setup

- **CI workflow**: builds on push/PR, uploads VSIX as artifact
- **Release workflow**: separate manual trigger, rebuilds everything, publishes

The release workflow attaches VSIX to the **GitHub Release** (not workflow artifacts). Check: Releases page → v0.1.1 → Assets section.

## Option 1: Environment Protection Rules (Recommended)

Single workflow with manual approval gate. Same artifact, no rebuild.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.version.outputs.current }}
    steps:
      - uses: actions/checkout@v4

      - name: Get version
        id: version
        run: echo "current=$(jq -r .version package.json)" >> $GITHUB_OUTPUT

      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run lint
      - run: bun run compile
      - run: npx @vscode/vsce package --no-dependencies

      - uses: actions/upload-artifact@v4
        with:
          name: vsix-${{ steps.version.outputs.current }}
          path: "*.vsix"

  release:
    needs: build
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: production  # <-- requires manual approval
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/download-artifact@v4
        with:
          name: vsix-${{ needs.build.outputs.version }}

      - name: Publish to Marketplace
        run: npx @vscode/vsce publish -p ${{ secrets.VSCE_PAT }} --no-dependencies -i *.vsix

      - name: Create tag and release
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git tag "v${{ needs.build.outputs.version }}"
          git push origin "v${{ needs.build.outputs.version }}"

      - uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ needs.build.outputs.version }}
          files: "*.vsix"
          generate_release_notes: true
```

**Setup required:**
1. Repo Settings → Environments → Create "production"
2. Enable "Required reviewers" → add yourself
3. When CI runs on main, release job shows "Waiting for approval"
4. Click "Review deployments" → Approve → release runs with same artifact

**Pros:** Same artifact, no rebuild, clear audit trail
**Cons:** Slightly more setup, approval UI is per-run (not a separate button)

## Option 2: Tag-triggered Release

Push a tag to trigger release. CI already validated the commit.

```yaml
# ci.yml - unchanged, runs on push/PR

# release.yml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run compile  # rebuild, but from tagged commit
      - run: npx @vscode/vsce package --no-dependencies
      - run: npx @vscode/vsce publish -p ${{ secrets.VSCE_PAT }} --no-dependencies
      # ... create release
```

**Workflow:**
```bash
# After CI passes on main
git tag v0.1.2
git push origin v0.1.2
# Release workflow triggers automatically
```

**Pros:** Simple, common pattern, tag = release intent
**Cons:** Still rebuilds (could download CI artifact by commit SHA instead)

## Option 3: workflow_run + Manual Dispatch Hybrid

Release workflow triggered by CI completion, but requires manual dispatch to actually publish.

```yaml
name: Release
on:
  workflow_dispatch:
    inputs:
      run_id:
        description: 'CI run ID to release from'
        required: true

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: vsix
          github-token: ${{ secrets.GITHUB_TOKEN }}
          run-id: ${{ inputs.run_id }}
      # publish downloaded artifact
```

**Pros:** True promotion, no rebuild
**Cons:** Must manually find/enter run ID, artifacts can expire

## Recommendation

**Option 1** is closest to GitLab's manual stage pattern:
- Same pipeline/workflow
- Same artifact (no rebuild)
- Clear approval gate with audit log
- GitHub native, no external tooling

**Option 2** is simpler if you're okay with rebuilding. Tag push is a well-understood release trigger.

## Current Issue: Missing Artifact on Release

The release workflow doesn't use `upload-artifact`. The VSIX goes directly to:
1. VS Code Marketplace (via `vsce publish`)
2. GitHub Release assets (via `softprops/action-gh-release`)

Check https://github.com/jdillon/vscode-beads/releases for the VSIX download.
