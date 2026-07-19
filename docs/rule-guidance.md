# Oxlint rule guidance

Each rule targets one concrete Effect anti-pattern and emits one actionable diagnostic.

## Match Strategy

Use Oxlint's ESLint-compatible ESTree API. Prefer specific node visitors, then constrain within relevant call, function, or pipeline subtree using helpers from `lib/ast.js`.

Use `defineEffectFileRule` only when rule should activate after an `effect`, `effect/*`, or `@effect/atom-react` reference. Rules without this scope must stay global.

Anchor diagnostic on prohibited operator or smallest useful enclosing statement. Keep preset severity unchanged unless rule policy changes.

## Diagnostic Contract

Build messages with `remediationMessage` and include these sections in order:

```text
Detected: <exact syntax or structure that triggered the rule>.
Problem: <specific consequence in this project>.
Fix: <bounded Effect v4 remediation or explicit exception path>.
Preserve: <behavior and type semantics an automated edit must not change>.
```

Avoid generic instructions such as "simplify this" or "use an explicit pipeline." Name applicable Effect v4 APIs and state when suggested alternatives are not semantically interchangeable. Broad matchers must use report-specific messages so diagnostic identifies exact trigger.

## Plugin API

Define rules with `createOnce` through `eslintCompatPlugin`. Reset per-file state in `before`. Use `Program` when setup must run for every file.

Do not use type-aware APIs. Oxlint JS plugins currently support TypeScript syntax but not TypeScript type information.

Every rule inherits `ignoredPathFragments` from `rules/rule.js`. Add rule-specific options only when they change matching behavior meaningfully; use Oxlint severity for activation.

## Validation

Add invalid and valid behavioral tests. Labels use `It catches ...` and `It allows ...`.

Run:

```bash
corepack yarn test
```

Tests must execute real Oxlint CLI with only target rule enabled. Add rule to applicable presets and `tests/rules/all-rules.test.ts`.
