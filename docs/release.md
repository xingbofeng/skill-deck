# Release Runbook

This project uses a manual GitHub Actions workflow for controlled releases. CI can run automatically on `main` and pull requests, while npm and MCP Registry publishing require a person to open GitHub Actions, enter the version, and start the `Manual release` workflow.

## Required secrets and permissions

Configure this repository secret before publishing to npm:

```text
NPM_TOKEN
```

The token must have permission to publish the `skill-deck` package.

The MCP Registry publish step uses GitHub Actions OIDC:

```text
permissions:
  id-token: write
```

No separate MCP Registry token is required for the GitHub-backed server name `io.github.xingbofeng/skill-deck`.

## Pre-release checklist

1. Confirm CI is green on `main`.
2. Confirm README and docs install commands point to `skill-deck`.
3. Confirm `registry/server.json` validates with the MCP Registry publisher schema.
4. Pick the npm/MCP Registry version to publish, for example `0.1.1`.

## Manual release

Open GitHub Actions, choose `Manual release`, and click `Run workflow`.

Only one input is required:

```text
version: 0.1.1
```

The workflow always checks out `main`, applies the entered version inside the GitHub Actions checkout, and does not commit the version change back to the repository.

Release steps:

1. Install dependencies with `npm ci`.
2. Apply the entered version to `package.json` and `registry/server.json`.
3. Run `npm run release:check`.
4. Run `npm run pack:dry-run`.
5. Validate `registry/server.json` with `mcp-publisher validate`.
6. Build the npm package.
7. Publish `skill-deck` to npm with the `latest` tag.
8. Publish `registry/server.json` to the MCP Registry with `mcp-publisher login github-oidc` and `mcp-publisher publish`.

If the entered npm version already exists, the npm step logs that it is skipping npm publish and continues to MCP Registry publish. This keeps re-runs and registry backfills idempotent, but normal releases should still use a new version.

## MCP Registry metadata

The repository keeps the MCP Registry metadata in:

```text
registry/server.json
```

Current server name:

```text
io.github.xingbofeng/skill-deck
```

Current npm package:

```text
skill-deck
```

The release workflow updates both the top-level MCP Registry version and the npm package version inside `registry/server.json` before validation and publish.

## Local commands

The workflow mirrors these local commands:

```bash
npm ci
npm run release:check
npm run pack:dry-run
```

`release:check` runs lint, typecheck, tests, and build. `pack:dry-run` shows exactly what npm would publish.
