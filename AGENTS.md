# Repository guide

## Overview

`kodelet-dictate` is a TypeScript npm package that provides local speech-to-text dictation for Kodelet. Source files and tests live in `src/`. Compiled output is written to the ignored `dist/` directory, while `package-lock.json` is committed for reproducible installs and releases.

Requirements: Node.js 22 or newer and npm with install-script policy support.

## Development

Install the locked dependencies without modifying the user's Kodelet plugin directories:

```bash
KODELET_SKIP_DICTATE_PLUGIN_INSTALL=1 \
KODELET_SKIP_MCP_PLUGIN_INSTALL=1 \
npm ci --strict-allow-scripts
```

Run the full typecheck and test suite:

```bash
npm run check
```

Build the package:

```bash
npm run build
```

Install the development build into the global Kodelet plugin directory:

```bash
npm run install-extension
```

Inspect or create the publishable tarball:

```bash
npm pack --dry-run
npm pack
```

Do not commit `dist/`, `node_modules/`, or generated `.tgz` files.

## Releasing

Publishing is handled by `.github/workflows/publish.yml`. The workflow runs only when a `v*` tag is pushed, verifies that the tag matches the version in `package.json`, runs the locked install and checks, and publishes to npm using OIDC trusted publishing. Do not add an `NPM_TOKEN` secret.

The npm trusted publisher must allow `npm publish` for:

- GitHub owner: `jingkaihe`
- Repository: `kodelet-dictate`
- Workflow filename: `publish.yml`
- Environment: none

To prepare a release, update and commit the package version, then push `main`:

```bash
VERSION=0.1.2
npm version "$VERSION" --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release v$VERSION"
git push origin main
```

Create and push the matching annotated tag:

```bash
npm run release
```

`npm run release` requires a clean worktree, fetches `origin/main` and existing tags, verifies that `HEAD` exactly matches `origin/main`, runs the checks, creates `v<package-version>`, and pushes only that tag. The tag push triggers npm publication.
