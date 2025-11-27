# Publishing to VS Code Marketplace

## Prerequisites

1. **Azure DevOps Account** - Required for marketplace access
2. **Personal Access Token (PAT)** - For authentication
3. **vsce CLI** - VS Code Extension packaging tool (`brew install vsce`)

## One-Time Setup

### 1. Create Azure DevOps Organization

1. Go to https://aex.dev.azure.com/signup (direct signup URL)
2. Sign in with a Microsoft account
   - Use existing Microsoft/Outlook/Hotmail/Xbox account, OR
   - Click "Create one!" to make a new Microsoft account
   - GitHub login also works (links to Microsoft account)
3. After sign-in, you'll see "We need a few more details"
   - Country/Region: Select yours
   - Click "Continue"
4. Create your organization:
   - Organization name: anything works (e.g., `my-personal`, `my-vscode-ext`)
   - Host your projects in: pick region closest to you
   - Click "Continue"
5. It will prompt to create a project - enter any name (e.g., `sandbox`)
   - This project isn't used for marketplace publishing
   - The organization itself is what you need

**Verification**: You should now be at `https://dev.azure.com/YOUR-ORG-NAME`

### 2. Create Personal Access Token (PAT)

1. In Azure DevOps, click User Settings (person icon, top right)
2. Select "Personal Access Tokens"
3. Click "New Token"
4. Configure:
   - Name: `vscode-marketplace`
   - Organization: "All accessible organizations"
   - Expiration: 1 year (max)
   - Scopes: Click "Show all scopes", find **Marketplace**, check **Manage**
5. Click "Create"
6. **Copy the token immediately** (only shown once)

### 3. Create Publisher

Create via web (CLI command deprecated): https://aka.ms/vscode-create-publisher

Required fields:
- **Name**: Display name (e.g., `Planet57`)
- **ID**: Unique identifier (e.g., `planet57`) - must match `publisher` in package.json

### 4. Login

```bash
vsce login planet57
# Paste PAT when prompted
```

### 5. Store PAT as GitHub Secret

1. Go to repo Settings → Secrets and variables → Actions
2. Add secret: `VSCE_PAT` with your PAT value

## GitHub Actions Workflows

### CI Workflow (`.github/workflows/ci.yml`)

Runs on every push to main and on PRs:
- Install dependencies
- Lint
- Compile
- Package (dry-run)

### Release Workflow (`.github/workflows/release.yml`)

Manual workflow dispatch:
1. Runs lint and compile
2. Packages VSIX
3. Publishes to VS Code Marketplace
4. Creates git tag (e.g., `v0.1.0`)
5. Creates GitHub Release with VSIX attached
6. Bumps patch version in package.json for next dev cycle

**To release**: Actions → Release → Run workflow

## Manual Publishing

```bash
# Package only (no publish)
vsce package

# Publish current version
vsce publish

# Publish with version bump
vsce publish patch  # 0.1.0 → 0.1.1
vsce publish minor  # 0.1.0 → 0.2.0
vsce publish major  # 0.1.0 → 1.0.0
```

## Useful Commands

```bash
vsce ls                              # List files that will be packaged
vsce package                         # Create VSIX locally
vsce publish                         # Publish to marketplace
vsce unpublish planet57.vscode-beads # Remove from marketplace
```

## Links

- [Extension URL](https://marketplace.visualstudio.com/items?itemName=planet57.vscode-beads)
- [Publisher Management](https://marketplace.visualstudio.com/manage/publishers/planet57)
- [Publishing Extensions Docs](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce CLI Reference](https://github.com/microsoft/vscode-vsce)
