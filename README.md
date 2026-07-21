# OXC Effect

`@shekohex/oxc-effect` is an Oxlint JS plugin for Effect TypeScript. It enforces flat composition, explicit sequencing, readable control flow, and code shapes that are easier to remediate mechanically.

Targets Effect v4 only. Effect v3 APIs and rule aliases are not supported.

All former Biome Grit rules are implemented with Oxlint's ESLint-compatible plugin API. The plugin uses `eslintCompatPlugin` and `createOnce`, so it runs through Oxlint's optimized JS plugin path while remaining ESLint-compatible.

## Install

```bash
npm install -D @shekohex/oxc-effect
```

```bash
yarn add -D @shekohex/oxc-effect
```

```bash
pnpm add -D @shekohex/oxc-effect
```

`oxlint` and `@oxlint/plugins` are runtime dependencies, so the package CLI works without separate setup.

`effect` `^4.0.0-beta.0` is a required peer dependency. `@effect/atom-react` `^4.0.0-beta.0` is optional and only needed for React Atom projects.

## Configure Oxlint

Use the full preset from `.oxlintrc.json`:

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "extends": [
    "./node_modules/@shekohex/oxc-effect/configs/full.jsonc"
  ]
}
```

Available presets:

- `configs/full.jsonc`: every rule
- `configs/core.jsonc`: Effect composition and control-flow rules
- `configs/web.jsonc`: React and Effect Atom rules
- `configs/ts-type.jsonc`: type-modeling and boundary rules

Oxlint does not support npm shared-config names in `extends`. Use explicit `node_modules` file path shown above.

## Select Rules

Register plugin directly when using custom subset:

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "jsPlugins": [
    {
      "name": "effect",
      "specifier": "@shekohex/oxc-effect"
    }
  ],
  "rules": {
    "effect/no-effect-gen-callback-alias": "error",
    "effect/no-effect-fn-callback-alias": "error",
    "effect/prefer-effect-fn": "error",
    "effect/no-return-in-arrow": "warn"
  }
}
```

Oxlint JS plugins are currently alpha. Pin package versions when adopting them in CI.

## CLI

Package ships zero-setup CLI. It writes temporary Oxlint config with selected preset and runs bundled Oxlint binary.

```bash
npx @shekohex/oxc-effect check src/file.ts
npx @shekohex/oxc-effect check src/messages --preset=core
npx @shekohex/oxc-effect check src/messages --preset=core --guide-on-linting
npx @shekohex/oxc-effect guide
```

`check` runs Oxlint. `--preset` accepts `full`, `core`, `web`, or `ts-type`. `--guide` prints remediation guide before linting. `--guide-on-linting` prints it only when Oxlint exits non-zero. `guide --print` prints packaged guide content.

## Agent Guide

Package includes remediation guidance at `docs/linting.md`.

```bash
npx @shekohex/oxc-effect guide
npx @shekohex/oxc-effect guide --print
```

```bash
node -p "require.resolve('@shekohex/oxc-effect/agent-guide')"
```

## Severity

Most rules are errors. Shape guidance remains warnings:

- `no-effect-succeed-variable`
- `no-flatmap-ladder`
- `no-option-effect-branch`
- `prefer-assert-in-effect-test`
- `prefer-effect-async`
- `prefer-effect-cache`
- `prefer-effect-child-process`
- `prefer-effect-date-time`
- `prefer-effect-http-client`
- `prefer-effect-scheduling`
- `prefer-effect-test-layer`
- `prefer-schema-json`
- `no-return-in-arrow`
- `no-return-in-callback`
- `warn-effect-sync-wrapper`

Biome allowed one Grit rule to emit different severities. Oxlint severity belongs to rule configuration, so former `no-match-effect-branch` implementation is represented as error rule `no-match-effect-branch` and warning rule `no-option-effect-branch`.

## Rule Options

Every rule supports `ignoredPathFragments`. Diagnostics are skipped when current file path contains any configured fragment.

```jsonc
{
  "rules": {
    "effect/no-switch-statement": [
      "error",
      {
        "ignoredPathFragments": ["/generated/", ".stories."]
      }
    ],
    "effect/prefer-effect-http-client": "off"
  }
}
```

Use native severity to control activation:

- `"off"`: disabled
- `"warn"`: enabled as warning
- `"error"`: enabled as error

## Development

```bash
corepack yarn install --immutable
corepack yarn test
corepack yarn build
```

Tests execute real Oxlint processes against TypeScript and TSX fixtures. Every exported rule has direct invalid-case coverage; complex structural rules also retain valid fixtures and edge-case coverage.

## Layout

- `plugin.js`: published Oxlint plugin entrypoint
- `lib/ast.js`: shared ESTree traversal and matching helpers
- `rules/*.js`: converted rule modules
- `configs/*.jsonc`: published Oxlint presets
- `bin/oxc-effect.mjs`: zero-setup CLI
- `docs/linting.md`: remediation guide
- `tests/rules`: real Oxlint integration tests

## Tooling

Use this rule pack with `@effect/tsgo`, `@typescript/native-preview`, and `@effect/language-service`. Oxlint enforces code shape, Tsgo provides compile feedback, and Effect language service provides project-aware diagnostics.

## Publishing

Repository is Projen-managed. Edit `.projenrc.ts`, then run `corepack yarn tsx .projenrc.ts` when changing generated package metadata or workflows.

`release.yml` uses npm provenance and GitHub OIDC from the `npm` environment. Release Please opens a release PR after releasable commits reach `master`; merging that PR publishes the resulting package.

Because npm Trusted Publishers require an existing package, bootstrap `0.0.7` once from a trusted local machine:

1. Run `corepack yarn build`.
2. Authenticate with npm using `npm login`.
3. Publish the generated tarball with `npm publish dist/js/shekohex-oxc-effect-0.0.7.tgz --access public`.
4. On npmjs.com, configure GitHub Actions as trusted publisher with repository `shekohex/oxc-effect-linting-rules`, workflow `release.yml`, and environment `npm`.
5. Future Release Please versions authenticate through OIDC only; no npm token or GitHub secret is required.
