import { describe, expect, it } from "vitest";
import { lintSourceWithRule } from "./ruleTestHarness";

const effectImport = 'import "effect";\n';

const invalidCases = [
  [
    "no-arrow-ladder",
    `${effectImport}const value = ((first) => ((second) => second)(first))(1);`,
    "Detected: an immediately invoked inline function nested inside another inline invocation.",
  ],
  [
    "no-atom-registry-effect-sync",
    `${effectImport}const value = Effect.sync(() => Atom.get(sourceAtom));`,
    "Detected: Atom.get/set/update/modify/refresh or atomRegistry operations wrapped inside Effect.sync.",
  ],
  [
    "no-branch-in-object",
    "const value = { selected: Result.match(input, { onSuccess: identity, onFailure: fallback }) };",
    "Detected: Match, Option.match, or Result.match used directly as an object property value.",
  ],
  [
    "no-call-tower",
    "const value = Effect.map(Effect.succeed(1), identity);",
    "Detected: an Effect call passed directly into another Effect call.",
  ],
  [
    "no-effect-all-step-sequencing",
    "const value = Effect.all([Ref.set(state, 1)], { concurrency: 1 });",
    "Detected: Effect.all used as an ordered list of side-effecting steps.",
  ],
  [
    "no-effect-as",
    "const value = Effect.as(source, result);",
    "Detected: Effect.as replacing an Effect success value.",
  ],
  [
    "no-effect-callback",
    `${effectImport}const value = Effect.callback((resume) => resume(Effect.void));`,
    "Detected: a low-level Effect.callback integration.",
  ],
  [
    "no-effect-bind",
    `${effectImport}const value = Effect.bind("name", step);`,
    "Detected: Effect.bind builder-style accumulation.",
  ],
  [
    "no-effect-do",
    `${effectImport}const value = Effect.Do;`,
    "Detected: Effect.Do starting builder-style accumulation.",
  ],
  [
    "no-effect-fn-generator",
    `${effectImport}const value = Effect.fn(function* () { return 1; });`,
    "Detected: Effect.fn wrapping a generator function.",
  ],
  [
    "no-effect-ladder",
    "const value = Effect.map(Effect.flatMap(Effect.succeed(1), identity), identity);",
    "Detected: three or more Effect calls nested through their first arguments.",
  ],
  [
    "no-effect-never",
    `${effectImport}const value = Effect.never;`,
    "Detected: Effect.never in application code.",
  ],
  [
    "no-effect-catch-ladder",
    "const value = Effect.catch(Effect.flatMap(source, next), fallback);",
    "Detected: Effect.catch wrapped around a multi-step sequencing chain.",
  ],
  [
    "no-effect-side-effect-wrapper",
    "const value = Effect.as(setState(nextState), result);",
    "Detected: Effect.as applied to an Effect containing an obvious state, invalidation, logging, or console side effect.",
  ],
  [
    "no-effect-step-const-staging",
    "const staged = Effect.succeed(value);",
    "Detected: a const initialized with an intermediate Effect call or Effect pipeline.",
  ],
  [
    "no-effect-succeed-variable",
    `${effectImport}const result = Effect.succeed(value);`,
    "Detected: Effect.succeed wrapping an existing identifier or member value.",
  ],
  [
    "no-effect-sync-console",
    `${effectImport}const result = Effect.sync(() => console.log(value));`,
    "Detected: console output inside Effect.sync.",
  ],
  [
    "no-effect-type-alias",
    `${effectImport}type Result = Effect.Effect<string>;`,
    "Detected: a type alias containing Effect.Effect<Success, Error, Requirements>.",
  ],
  [
    "no-effect-wrapper-alias",
    "const load = () => Effect.succeed(value);",
    "Detected: a local declaration that only aliases an Effect pipeline or returns one unchanged.",
  ],
  [
    "no-family-collection-read",
    "const rowAtom = Atom.family((id) => get(UserCollectionAtom));",
    "Detected: an Atom.family callback reading an atom whose name indicates a collection, list, aggregate, or result set.",
  ],
  [
    "no-flatmap-ladder",
    "const value = Effect.flatMap(Effect.flatMap(source, first), second);",
    "Detected: nested Effect.flatMap calls or Effect.flatten over a nested Effect.map.",
  ],
  [
    "no-fragmented-const-assembly",
    "const value = { kind: 'failure', ...errorFields(cause) };",
    "Detected: an object literal spreading the result of a function call.",
  ],
  [
    "no-option-nullish-rewrap",
    `${effectImport}const value = Option.fromNullishOr(input ?? null);`,
    "Detected: an Option.fromNullishOr/fromNullOr/fromUndefinedOr argument with a matching ?? null or ?? undefined fallback.",
  ],
  [
    "no-if-statement",
    `${effectImport}if (condition) run();`,
    "Detected: an if statement in an Effect ecosystem file.",
  ],
  [
    "no-iife-wrapper",
    `${effectImport}const value = ((input) => input)(source);`,
    "Detected: an inline function invoked immediately.",
  ],
  [
    "no-inline-runtime-provide",
    `${effectImport}const value = Effect.gen(function* () { const runtime = yield* Service.pipe(Effect.provide(ServiceLive)); return runtime; });`,
    "Detected: Effect.provide used inside a generator pipeline with one inline dependency argument.",
  ],
  [
    "no-manual-data-guard",
    "type Data = { id: string }; const isData = (value: unknown): value is Data => typeof value === 'object';",
    "Detected: a user-defined type predicate that narrows an unknown or any parameter without decoding it.",
  ],
  [
    "no-manual-effect-channels",
    "type Result = Effect.Effect<string, Error, Environment>;",
    "Detected: explicit generic channel arguments on Effect.Effect or Layer.Layer.",
  ],
  [
    "no-match-effect-branch",
    "const value = Match.value(input).pipe(Match.when(true, () => Effect.succeed(input).pipe(Effect.map(identity))));",
    "Detected: a Match branch containing multiple Effect sequencing steps.",
  ],
  [
    "no-match-void-branch",
    `${effectImport}const value = Match.when(true, () => Effect.void);`,
    "Detected: a Match branch that returns Effect.void.",
  ],
  [
    "no-model-overlay-cast",
    `${effectImport}const value = input as DomainModel;`,
    "Detected: a non-const TypeScript as assertion on a const initializer in an Effect ecosystem file.",
  ],
  [
    "no-naked-object-state-update",
    "const value = JSON.parse(serialized);",
    "Detected: JSON.parse or JSON.stringify in state-oriented code.",
  ],
  [
    "no-nested-effect-call",
    `${effectImport}const value = Effect.map(Effect.flatMap(Effect.succeed(1), identity), identity);`,
    "Detected: an Effect call nested at least three calls deep through first arguments.",
  ],
  [
    "no-nested-effect-gen",
    `${effectImport}const value = Effect.gen(function* () { return yield* Effect.gen(function* () { return 1; }); });`,
    "Detected: Effect.gen nested inside another Effect.gen callback.",
  ],
  [
    "no-option-as",
    `${effectImport}const value = Option.as(source, selected);`,
    "Detected: Option.as replacing a present Option value.",
  ],
  [
    "no-option-boolean-normalization",
    `${effectImport}const value = Option.match(input, { onSome: (current) => current === true, onNone: () => false });`,
    "Detected: Option.match mapping some with value === true and none with false.",
  ],
  [
    "no-option-effect-branch",
    "const value = Option.match(input, { onSome: () => Effect.succeed(input).pipe(Effect.map(identity)), onNone: () => Effect.void });",
    "Detected: an Option.match branch containing multiple Effect sequencing steps.",
  ],
  [
    "no-pipe-ladder",
    "const value = pipe(source, Effect.map((item) => pipe(item, normalize)));",
    "Detected: a pipe() call nested inside an argument of another pipe() call.",
  ],
  [
    "no-pipeline-fragment-staging",
    "function load() { const fragment = pipe(source, Effect.map(identity)); return pipe(fragment, Effect.flatMap(next)); }",
    "Detected: a local pipe result stored in a const and later consumed by another returned pipe in the same block.",
  ],
  [
    "no-react-state",
    "const [value] = useState(0);",
    "Detected: useState governed by the Effect Atom architecture rule.",
  ],
  [
    "no-render-side-effects",
    `${effectImport}Match.value(input).pipe(Match.when(true, () => run()));`,
    "Detected: a Match.value(...).pipe(...) expression used as a standalone statement.",
  ],
  [
    "no-return-in-arrow",
    "const value = items.map((item) => { return item.id; });",
    "Detected: a return statement inside a block-bodied arrow callback.",
  ],
  [
    "no-return-in-callback",
    "const value = items.map(function (item) { return item.id; });",
    "Detected: a return statement inside an inline function-expression callback.",
  ],
  [
    "no-return-null",
    `${effectImport}function load() { return null; }`,
    "Detected: a return statement whose value is null.",
  ],
  [
    "no-effect-runfork",
    `${effectImport}const fiber = Effect.runForkWith(services)(program);`,
    "Detected: Effect.runFork or Effect.runForkWith inside an Effect ecosystem file.",
  ],
  [
    "no-string-sentinel-const",
    "const status = 'ready';",
    "Detected: a const initialized with a string literal.",
  ],
  [
    "no-string-sentinel-return",
    "const value = Effect.succeed('ready');",
    "Detected: Effect.succeed called with a string literal.",
  ],
  [
    "no-switch-statement",
    `${effectImport}switch (value) { case 'ready': run(); }`,
    "Detected: a switch statement in an Effect ecosystem file.",
  ],
  [
    "no-ternary",
    `${effectImport}const value = condition ? first : second;`,
    "Detected: a conditional expression in an Effect ecosystem file.",
  ],
  [
    "no-try-catch",
    "try { run(); } catch (error) { recover(error); }",
    "Detected: a try/catch statement.",
  ],
  [
    "no-unknown-boolean-coercion-helper",
    `${effectImport}const value = typeof input === 'boolean'; const fallback = Match.orElse(() => null);`,
    "Detected: a typeof value === boolean check in an Effect file that also contains null-fallback matching.",
  ],
  [
    "no-wrapgraphql-catch",
    `${effectImport}const value = pipe(wrapGraphqlCall(request), Effect.catch(handleError));`,
    "Detected: Effect.catch after wrapGraphqlCall or an applyResponse sequencing step.",
  ],
  [
    "prevent-dynamic-imports",
    "const module = import('./feature.js');",
    "Detected: a dynamic import() expression.",
  ],
  [
    "warn-effect-sync-wrapper",
    `${effectImport}const value = Effect.sync(() => sendMetric(metric));`,
    "Detected: Effect.sync whose body is a single non-console function call.",
  ],
] as const;

describe("all converted rules", () => {
  it.each(invalidCases)("It catches $0 patterns", (ruleName, source, diagnostic) => {
    const result = lintSourceWithRule(ruleName, source);
    expect(result.output).toContain(diagnostic);
  });
});
