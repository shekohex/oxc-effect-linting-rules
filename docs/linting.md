### Linting Discipline

Linting enforces declarative control flow and blocks drift toward imperative or wrapper-heavy Effect code. The goal is readable code with one explicit flow. Do not make changes to appeas linter.

### Scope

This document defines how to respond to diagnostics from the `@shekohex/oxc-effect` rule pack.

It is written for human maintainers and coding agents that are rewriting code after Oxlint reports a rule violation.

### Rewrite method

Start on lint errors with a rewrite of methods into one explicit Effect pipeline.

Do it like this: build context once, select one decision model, and keep that decision visible in the main flow. Do not hide branching inside callback arguments, object literals, nested helper wrappers, or control-flow scaffolding that exists only to satisfy the checker.

Fix one method at a time and keep adjacent behavior unchanged.

### Canonical Effect functions

Define reusable effectful operations with an inline `Effect.fn` callback:

```ts
const loadUser = Effect.fn("UserService.loadUser")(function* (userId: UserId) {
  const repository = yield* UserRepository
  return yield* repository.get(userId)
})
```

Do not extract the callback into a one-use `loadUserGen` or `loadUserOperation` declaration. The `Effect.fn` call is the observable operation boundary and should contain its implementation.

Use `Effect.gen` for inline workflows and scoped transaction bodies. Do not wrap `Effect.gen` in a reusable arrow or function declaration; use `Effect.fn` instead.

Generator guard clauses may use ordinary `if` statements. Terminal failures and interruption must use `return yield*` so control-flow exit and narrowing remain explicit.

Use `Effect.fnUntraced` only for measured low-level hot paths configured as explicit exceptions.

Read current time through Effect `Clock` or `DateTime`. Keep native `Date` construction for conversion from explicit supplied values, not ambient wall-clock access.

### Effect capabilities

Prefer replaceable Effect services over ambient JavaScript and Node capabilities:

- use `Config` and `ConfigProvider` instead of reading `process.env` in application code
- use Effect `FileSystem` with a platform layer instead of importing `node:fs`
- use `effect/unstable/http` `HttpClient`, `HttpClientRequest`, and `HttpClientResponse` instead of raw `fetch`
- use `Effect.sleep`, `Effect.delay`, `Effect.timeout`, and `Schedule` instead of native timers
- use `Effect.async` for callback registration and `Effect.tryPromise` for Promise APIs instead of constructing Promises manually
- use `TestClock`, `Deferred`, `Queue`, or `Latch` instead of live sleeps in tests
- use Effect `Random` instead of `Math.random` when randomness should be replaceable in tests
- use Effect logging instead of `console` inside Effect generators
- use `ChildProcess` and `ChildProcessSpawner` instead of `node:child_process`
- use `Cache`, `ScopedCache`, or `Effect.cached*` instead of cache-named native maps with manual TTL and eviction
- use `DateTime.make` or Schema date-time codecs instead of unchecked `Date.parse`
- use Schema JSON codecs instead of raw `JSON.parse` or `JSON.stringify` in Effect application code

Raw platform APIs remain valid inside deliberate adapters where Effect does not own the host boundary. Keep such adapters focused, preserve cancellation and cleanup, and configure a narrow `ignoredPathFragments` exception instead of weakening a rule repository-wide.

### Effect tests

Import Vitest APIs from `@effect/vitest` in Effect test files. Use regular `it` for pure synchronous tests and `it.effect` for tests returning Effects.

Do not call `Effect.runPromise`, `Effect.runSync`, or `Effect.runCallback` inside tests. Return the Effect from `it.effect` or `it.live` so the test runtime owns scope and failure reporting.

Use top-level `layer(...)` for shared setup and `it.layer(...)` for isolated or nested setup. Avoid repeated local `Effect.provide(...)`; focused `provideService` overrides remain valid for one-off test values.

Use `assert` from `@effect/vitest` inside Effect tests. Keep `expect` only in pure Vitest tests when its matcher API is specifically required.

Real `Effect.sleep` is allowed only in deliberate `it.live` tests. Normal `it.effect` tests should use `TestClock` or explicit synchronization.

### Schema boundaries

Use `Schema.decodeUnknownEffect` and `Schema.encodeUnknownEffect` inside Effect generators. Synchronous Schema APIs are valid in pure tests, scripts, and intentional startup boundaries, but should not turn application validation failures into defects.

Explicit `Effect.Effect<Success, Error, Requirements>` and `Layer.Layer<Output, Error, Input>` types are valid and encouraged on public service and layer contracts. Prefer inference for locals, not by banning channel types globally.

Ordinary ternaries, string values, and nested scoped `Effect.gen` workflows are not lint violations by themselves. Rules must target the actual unsafe boundary or indirection rather than force ceremonial rewrites.

### Non-compliant patterns

Do not add helper wrappers whose only purpose is to return Effects.

Do not hide sequencing through nested `pipe` ladders, flatMap towers, or generator nesting.

Do not implement control flow with `switch` or `case`. Use `Match.value`, `Option.match`, `Result.match`, or `Effect.if` so the decision stays explicit inside one Effect pipeline.

Do not add post-decode guards or fallback defaults unless the domain actually requires them.

Do not encode sequential side effects through `Effect.all(..., { concurrency: 1 })`.

Do not introduce workaround combinators, placeholder abstractions, or type wrappers that hide intent instead of improving the code shape.

### Required lint workflow

Use the smallest working directory that contains all files you are changing.

Run one summary pass for that directory to establish the baseline:

`npx oxlint <working-dir>`

During remediation, run file-level lint only for the files you edit:

`npx oxlint <file>`

Rerun dir summary lint only after the touched files are clean or when you need a final status check.

If the summary output includes unrelated files, reduce the scope to a smaller directory and continue with file-level checks.

Run lint from the package or repository root that owns the Oxlint configuration for the files you are editing.

### Compile checks

Run compile checks during and after file-level lint remediation because structural rewrites can introduce TypeScript regressions.

Treat compile as a completion gate for the edited files. Lint remediation is complete when file-level Oxlint is clean and the project compiler reports no relevant problems in the touched files.

Use the repository's project-mode compile command. Do not substitute ad hoc single-file `tsc` invocations for the normal compile gate unless the repository explicitly documents that workflow.

If the repository has separate compile boundaries for different packages or apps, run the compile command that matches the code you changed.

### Declaration-surface checks

When TypeScript reports declaration diagnostics such as `TS4023` or `TS4020`, treat them as exported type-surface problems.

Do not patch declaration problems with wrappers, fallback helpers, or broad rewrites.

Keep `Effect` and `Layer` assembly values local. Export stable boundary entry points such as services, layers, facades, or explicitly typed constructors instead of deep inferred intermediate values.

If an exported constructor is required, bind its contract at the domain boundary instead of exporting deep inferred channel shapes.

Use the normal project compile command for verification. Do not rely on single-file declaration checks that bypass project compiler settings and produce misleading diagnostics.

If scoped verification is needed, run the normal project compile command and then filter the output by file path and diagnostic code.

### Type signature inspection

When lint remediation or layer wiring requires an exact `Effect` or `Layer` type, use a repository-local inspection tool if one exists.

The tool should print the fully rendered type for a top-level variable or export under the repository's normal TypeScript configuration. If the repository does not provide such a tool, inspect the type through the project compiler or the editor language service instead of guessing.

### Plugin policy

Rules should enforce clarity, not force linter workaround choreography.

Use error severity for imperative control flow and hidden sequencing. Use warning severity for non-blocking shape guidance.

Rule messages explain why the pattern is wrong or subotimal and what shape the rewrite take.

If a rule cannot match the same violation reliably, simplify it or remove it.

### Completion

Finish with one summary pass for the chosen working directory, then run the required compile checks.

Completion criteria:

- Touched files are free of Oxlint errors.
- Touched files have no related TypeScript diagnostics from the required project compile check.
- Changed methods read as one explicit flow with no defensive wrappers or lint-appeasement workarounds.
