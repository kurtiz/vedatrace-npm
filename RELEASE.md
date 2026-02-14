# Release Process

This project uses [Changesets](https://github.com/changesets/changesets) to manage versioning and changelog generation.

## Quick Start

### 1. Make Changes

Develop your feature or fix as usual.

### 2. Add a Changeset

Before committing, run:

```bash
bun changeset
```

This will:
- Ask you what type of change it is (patch/minor/major)
- Prompt you for a description
- Create a `.changeset/*.md` file

**Commit this file** along with your code changes.

### 3. Create a PR

Open a pull request to the appropriate branch:
- `main` - for stable releases
- `beta` - for beta pre-releases
- `alpha` - for alpha pre-releases

### 4. Merge & Release

Once your PR is merged, GitHub Actions will:
1. Create a "Version Packages" PR (if changesets exist)
2. When you merge that PR, it publishes to npm automatically

## Pre-releases (Beta/Alpha)

To publish pre-release versions:

```bash
# Enter pre-release mode for beta
bun changeset pre enter beta

# Make your changes and add changesets normally
bun changeset

# The versioning and publishing happens automatically on merge
# Versions will be like: 0.1.0-beta.0

# When ready for stable release, exit pre mode
bun changeset pre exit
```

## Understanding Version Bumps

- **Patch** (0.0.1 → 0.0.2): Bug fixes, small improvements
- **Minor** (0.0.1 → 0.1.0): New features, backwards compatible
- **Major** (0.1.0 → 1.0.0): Breaking changes

## Setup Requirements

### One-time Setup (Repository Owner)

1. **Generate npm Access Token:**
   - Go to [npmjs.com](https://www.npmjs.com/) → Access Tokens
   - Create a **Granular Access Token** (not classic)
   - Give it publish permissions for the `vedatrace` package

2. **Add to GitHub Secrets:**
   - Go to GitHub repo → Settings → Secrets and variables → Actions
   - Add `NPM_TOKEN` with your npm token value

## Troubleshooting

### "No changesets found"

You need to run `bun changeset` before committing. Changesets track what needs to be released.

### "Version Packages PR not created"

The release workflow only creates a PR when there are changesets to consume. If you merged without a changeset, nothing will happen.

### Manual Release (Emergency)

If needed, you can trigger manually:

```bash
# Build and test locally first
bun run test
bun run build

# Login to npm (if not already)
npm login

# Publish
bun run release
```

## See Also

- [Changesets Documentation](https://github.com/changesets/changesets)
- `.changeset/config.json` - Configuration
- `CHANGELOG.md` - Auto-generated changelog
