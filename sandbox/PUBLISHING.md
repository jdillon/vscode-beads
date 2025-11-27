# Publishing to VS Code Marketplace

## Prerequisites

1. **Azure DevOps Account** - Required for marketplace access
2. **Personal Access Token (PAT)** - For authentication
3. **vsce CLI** - VS Code Extension packaging tool

## One-Time Setup

### 1. Create Azure DevOps Organization

1. Go to https://dev.azure.com
2. Sign in with Microsoft account (create one if needed)
3. Create an organization (any name works)

### 2. Create Personal Access Token (PAT)

1. In Azure DevOps, click User Settings (gear icon, top right)
2. Select "Personal Access Tokens"
3. Click "New Token"
4. Configure:
   - Name: `vscode-marketplace`
   - Organization: "All accessible organizations"
   - Expiration: 1 year (max)
   - Scopes: Click "Show all scopes", find "Marketplace", check "Manage"
5. Click "Create"
6. **Copy the token immediately** (only shown once)

### 3. Install vsce

```bash
npm install -g @vscode/vsce
```

### 4. Create Publisher

```bash
vsce create-publisher planet57
# Enter PAT when prompted
```

Or create via web: https://marketplace.visualstudio.com/manage

### 5. Login

```bash
vsce login planet57
# Enter PAT when prompted
```

## Publishing

### Manual Publish

```bash
# Bump version in package.json first
bun run compile
vsce publish
```

Or publish with version bump:
```bash
vsce publish patch  # 0.1.0 -> 0.1.1
vsce publish minor  # 0.1.0 -> 0.2.0
vsce publish major  # 0.1.0 -> 1.0.0
```

### Package Only (no publish)

```bash
vsce package
# Creates planet57.vscode-beads-0.1.0.vsix
```

## GitHub Actions Automation

### 1. Store PAT as Secret

1. Go to repo Settings → Secrets and variables → Actions
2. Add secret: `VSCE_PAT` with your PAT value

### 2. Create Workflow

Create `.github/workflows/publish.yml`:

```yaml
name: Publish Extension

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Compile
        run: bun run compile

      - name: Publish to Marketplace
        run: npx @vscode/vsce publish -p ${{ secrets.VSCE_PAT }}
```

### 3. Publish via Release

1. Create GitHub release with tag (e.g., `v0.1.0`)
2. Action triggers and publishes to marketplace

## Alternative: Publish on Tag Push

```yaml
name: Publish Extension

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Compile
        run: bun run compile

      - name: Publish to Marketplace
        run: npx @vscode/vsce publish -p ${{ secrets.VSCE_PAT }}
```

Then:
```bash
git tag v0.1.0
git push origin v0.1.0
```

## Pre-publish Checklist

- [ ] Update version in `package.json`
- [ ] Update CHANGELOG.md (if exists)
- [ ] Ensure README.md is current
- [ ] Test extension locally
- [ ] Run `bun run compile` successfully
- [ ] Verify `vsce package` creates valid VSIX

## Useful Commands

```bash
# Check what will be packaged
vsce ls

# Package without publishing
vsce package

# Publish specific version
vsce publish 0.2.0

# Unpublish (remove from marketplace)
vsce unpublish planet57.vscode-beads
```

## Links

- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Marketplace Management](https://marketplace.visualstudio.com/manage)
- [vsce CLI Reference](https://github.com/microsoft/vscode-vsce)
