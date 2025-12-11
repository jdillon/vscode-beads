# Open VSX Publishing

**Related**: vsbeads-8xt

## Overview

Cursor, VSCodium, and Google's Project IDX all use the [Open VSX Registry](https://open-vsx.org/) by default instead of Microsoft's VS Code Marketplace. Users of these editors cannot discover or install the extension from their built-in marketplace browser.

## Current Release Workflow

The existing GitHub Actions workflow (`.github/workflows/release.yml`) triggers on version tags and:

1. Validates tag matches `package.json` version
2. Validates CHANGELOG has release entry
3. Builds and packages VSIX
4. Publishes to VS Code Marketplace via `vsce publish`
5. Creates GitHub Release with VSIX attached

## Solution: Add Open VSX Publishing

Add `ovsx publish` step to the release workflow. The extension code requires no changes—Open VSX accepts the same VSIX format.

### Setup Steps

#### 1. Create Eclipse Account & Sign Agreement

Open VSX is operated by the Eclipse Foundation. Before publishing:

1. Go to [accounts.eclipse.org](https://accounts.eclipse.org/) and create an account (or link your GitHub)
2. Sign the **Eclipse Contributor Agreement (ECA)** at [eclipse.org/legal/ECA.php](https://www.eclipse.org/legal/ECA.php)
3. This is a one-time legal agreement for contributing to Eclipse projects

#### 2. Create Open VSX Account & Access Token

1. Go to [open-vsx.org](https://open-vsx.org/)
2. Sign in with GitHub (must be linked to your Eclipse account)
3. Go to Settings → Access Tokens
4. Create a new token with publish permissions
5. Copy the token (you won't see it again)

#### 3. Install ovsx CLI (local only)

For manual operations, install the CLI locally:

```bash
brew install ovsx        # macOS
# or
npm install -g ovsx      # any platform
```

GitHub Actions uses `npx ovsx` (no install needed).

#### 4. Create Namespace

Before publishing, you must create the namespace that matches your `package.json` publisher field (`planet57`).

```bash
ovsx create-namespace planet57 -p YOUR_TOKEN
```

**Important**: Creating a namespace does NOT give you exclusive publishing rights. Anyone can publish to an unclaimed namespace. See step 5 for claiming ownership.

Reference: [ovsx CLI README](https://github.com/eclipse/openvsx/blob/master/cli/README.md)

#### 5. Claim Namespace Ownership (for verified status)

Without ownership, your extensions show a ⚠️ warning icon instead of a ✓ verified badge. To claim ownership:

1. Log into [open-vsx.org](https://open-vsx.org/)
2. Create a **public issue** at [github.com/EclipseFdn/open-vsx.org/issues](https://github.com/EclipseFdn/open-vsx.org/issues) requesting ownership of the `planet57` namespace
3. Provide proof you own the namespace (e.g., link to your VS Code Marketplace publisher page, GitHub profile, etc.)
4. Wait for maintainers to review and grant ownership

Once granted, you become the namespace **owner** and can:
- Add/remove other contributors
- Your extensions display as "verified" with a shield icon

Reference: [Namespace Access Wiki](https://github.com/eclipse/openvsx/wiki/Namespace-Access)

#### 6. Add GitHub Secret

1. Go to repo Settings → Secrets and variables → Actions
2. Add new repository secret:
   - Name: `OVSX_PAT`
   - Value: (paste the token from step 2)

#### 7. Update Release Workflow

Add this step after the VS Code Marketplace publish:

```yaml
- name: Publish to Open VSX
  run: npx ovsx publish *.vsix -p ${{ secrets.OVSX_PAT }}
```

### Updated release.yml

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Extract version from tag
        id: version
        run: |
          TAG="${GITHUB_REF#refs/tags/}"
          VERSION="${TAG#v}"
          echo "tag=${TAG}" >> $GITHUB_OUTPUT
          echo "version=${VERSION}" >> $GITHUB_OUTPUT

      - name: Validate version matches package.json
        run: |
          PKG_VERSION=$(jq -r .version package.json)
          if [ "$PKG_VERSION" != "${{ steps.version.outputs.version }}" ]; then
            echo "::error::Tag version (${{ steps.version.outputs.version }}) does not match package.json version ($PKG_VERSION)"
            exit 1
          fi

      - name: Validate changelog has release entry
        run: |
          if ! grep -q "## \[${{ steps.version.outputs.version }}\]" CHANGELOG.md; then
            echo "::error::CHANGELOG.md missing entry for version ${{ steps.version.outputs.version }}"
            exit 1
          fi

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Lint
        run: bun run lint

      - name: Compile
        run: bun run compile

      - name: Package VSIX
        run: npx @vscode/vsce package --no-dependencies

      - name: Publish to VS Code Marketplace
        run: npx @vscode/vsce publish -p ${{ secrets.VSCE_PAT }} --no-dependencies

      - name: Publish to Open VSX
        run: npx ovsx publish *.vsix -p ${{ secrets.OVSX_PAT }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ steps.version.outputs.tag }}
          files: "*.vsix"
          generate_release_notes: false
          body: |
            See [CHANGELOG.md](https://github.com/jdillon/vscode-beads/blob/main/CHANGELOG.md) for release notes.
          draft: false
```

## One-Time Manual Setup Summary

Before the first automated release, Jason must complete these manual steps:

| Step | Action | One-time? |
|------|--------|-----------|
| 1 | Create Eclipse account | ✓ |
| 2 | Sign Eclipse Contributor Agreement | ✓ |
| 3 | Create Open VSX account (GitHub OAuth) | ✓ |
| 4 | Generate access token | ✓ |
| 5 | Create namespace: `ovsx create-namespace planet57 -p TOKEN` | ✓ |
| 6 | File ownership claim issue on GitHub | ✓ |
| 7 | Add `OVSX_PAT` secret to repo | ✓ |
| 8 | Update `release.yml` | ✓ |

After setup, releases are fully automated.

## Key Differences: vsce vs ovsx

| Aspect | vsce | ovsx |
|--------|------|------|
| Package | `@vscode/vsce` | `ovsx` |
| Registry | marketplace.visualstudio.com | open-vsx.org |
| Auth | `VSCE_PAT` (Azure DevOps PAT) | `OVSX_PAT` (Open VSX token) |
| Publish | `vsce publish -p $PAT` | `ovsx publish *.vsix -p $PAT` |
| Namespace | Implicit (created on first publish) | Explicit (must create before publish) |
| Verification | Automatic | Requires ownership claim |

Note: `ovsx` takes the VSIX file directly, while `vsce publish` packages and publishes in one step. Since we already package with `vsce package`, we pass the VSIX to `ovsx`.

## Optional: README Badge

Add marketplace badges to README:

```markdown
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/planet57.vscode-beads?label=VS%20Code)](https://marketplace.visualstudio.com/items?itemName=planet57.vscode-beads)
[![Open VSX](https://img.shields.io/open-vsx/v/planet57/vscode-beads?label=Open%20VSX)](https://open-vsx.org/extension/planet57/vscode-beads)
```

## Verification

After the first release with Open VSX publishing:

1. Check [open-vsx.org/extension/planet57/vscode-beads](https://open-vsx.org/extension/planet57/vscode-beads)
2. Have a Cursor user search for "Beads" in extensions
3. Verify version matches VS Code Marketplace version
4. Confirm verified badge appears (after ownership claim is approved)

## Troubleshooting

### "Namespace not found"

You must create the namespace before first publish:
```bash
npx ovsx create-namespace planet57 -p $OVSX_PAT
```

### Extension shows ⚠️ warning instead of verified

Namespace ownership hasn't been claimed or approved yet. File an issue at [github.com/EclipseFdn/open-vsx.org/issues](https://github.com/EclipseFdn/open-vsx.org/issues).

### Token permissions

Ensure the Open VSX token has "publish" scope. Read-only tokens will fail.

### "User is not a member of namespace"

You created the namespace but aren't a member. This can happen if you created it via CLI but didn't log into the web UI first. Log into open-vsx.org and check your namespace settings.

## References

- [Open VSX Publishing Extensions Wiki](https://github.com/eclipse/openvsx/wiki/Publishing-Extensions)
- [Namespace Access Wiki](https://github.com/eclipse/openvsx/wiki/Namespace-Access)
- [ovsx CLI on GitHub](https://github.com/eclipse/openvsx/tree/master/cli)
- [Eclipse Contributor Agreement](https://www.eclipse.org/legal/ECA.php)
