import {
  collect,
  contains,
  findDescendant,
  hasAncestor,
  identifierName,
  isCall,
  isConstDeclaration,
  isEffectCall,
  isFunction,
  isIdentifier,
  isMember,
  isMemberStartingWith,
  isPipeCall,
  literalValue,
  memberName,
  propertyName,
  returnedExpression,
  unwrapExpression,
} from "../lib/ast.js";
import { defineEffectFileRule, defineRule, remediationMessage } from "./rule.js";

const messages = {
  noArrowLadder: remediationMessage({
    detected: "an immediately invoked inline function nested inside another inline invocation.",
    problem: "the wrappers hide evaluation order and the branch that selects the result.",
    fix: "remove the wrappers, bind required inputs to named local values, and express one Match or Option decision in one visible pipeline.",
    preserve: "evaluation order, captured values, branch outputs, and side effects.",
  }),
  noCallTower: remediationMessage({
    detected: "an Effect call passed directly into another Effect call.",
    problem: "nested calls make sequencing and data flow difficult to inspect.",
    fix: "make the outer source visible and compose subsequent steps with pipe, Effect.flatMap, Effect.andThen, or Effect.tap.",
    preserve: "execution order, success values, typed errors, requirements, and concurrency behavior.",
  }),
  noEffectAllStepSequencing: remediationMessage({
    detected: "Effect.all used as an ordered list of side-effecting steps.",
    problem: "Effect.all communicates aggregation or concurrency rather than intentional linear sequencing.",
    fix: "compose the steps in order with Effect.andThen or Effect.tap; keep Effect.all only when collecting independent results.",
    preserve: "step order, failure propagation, interruption, and the final output value.",
  }),
  noEffectAs: remediationMessage({
    detected: "Effect.as replacing an Effect success value.",
    problem: "this project requires value replacement to remain explicit in the visible pipeline.",
    fix: "use Effect.map(() => replacement); use Effect.asVoid only when the required output is intentionally void.",
    preserve: "lazy execution, typed errors, requirements, and the exact success value expected by callers.",
  }),
  noEffectCallback: remediationMessage({
    detected: "a low-level Effect.callback integration.",
    problem: "callback registration, cancellation, and completion are difficult to review when embedded in application flow.",
    fix: "move the callback adapter to an integration boundary; use Stream for repeated events or a higher-level Effect API when one exists.",
    preserve: "single versus repeated completion, cancellation cleanup, error mapping, and callback timing.",
  }),
  noEffectBind: remediationMessage({
    detected: "Effect.bind builder-style accumulation.",
    problem: "named builder fields split one operation across hidden intermediate Effect values.",
    fix: "rewrite as one pipe-based flow or one top-level Effect.gen with direct yields.",
    preserve: "field dependencies, evaluation order, typed errors, requirements, and final object shape.",
  }),
  noEffectDo: remediationMessage({
    detected: "Effect.Do starting builder-style accumulation.",
    problem: "the builder spreads one operation across generated intermediate fields.",
    fix: "rewrite as one pipe-based flow or one top-level Effect.gen with direct yields.",
    preserve: "field dependencies, evaluation order, typed errors, requirements, and final output.",
  }),
  noEffectFnCallbackAlias: remediationMessage({
    detected: "Effect.fn receiving its operation callback through an identifier.",
    problem: "the observable operation boundary and its implementation are split across separate declarations.",
    fix: "inline the generator or function callback inside Effect.fn; extract complete domain operations instead of callback aliases.",
    preserve: "span name, function parameters, transforms, laziness, typed errors, requirements, and return type.",
  }),
  noEffectFnUntraced: remediationMessage({
    detected: "Effect.fnUntraced used in application code.",
    problem: "the operation loses the stack-frame and tracing behavior provided by Effect.fn.",
    fix: "use Effect.fn with a meaningful span name, or configure an explicit exception for a measured low-level hot path.",
    preserve: "function parameters, laziness, typed errors, requirements, return type, and any whole-function transforms.",
  }),
  noEffectGenCallbackAlias: remediationMessage({
    detected: "Effect.gen receiving its generator callback through an identifier.",
    problem: "the workflow body is separated from the sequencing boundary, forcing readers to jump between one-use declarations.",
    fix: "inline the generator callback inside Effect.gen; extract a complete reusable operation with Effect.fn when it has an independent contract.",
    preserve: "yield order, local scope, laziness, typed errors, requirements, transaction boundaries, and return type.",
  }),
  noEffectLadder: remediationMessage({
    detected: "three or more Effect calls nested through their first arguments.",
    problem: "the resulting call ladder hides the order and values passed between steps.",
    fix: "rewrite the expression as one visible pipe with Effect.map, Effect.flatMap, Effect.andThen, or Effect.tap.",
    preserve: "evaluation order, success values, typed errors, requirements, and short-circuit behavior.",
  }),
  noEffectNever: remediationMessage({
    detected: "Effect.never in application code.",
    problem: "the Effect cannot complete normally, so ownership and interruption requirements are not visible locally.",
    fix: "model waiting with a scoped fiber, Stream, deferred signal, or another lifecycle-aware abstraction appropriate to the operation.",
    preserve: "interruption, finalizers, resource scopes, and the intended non-termination semantics.",
  }),
  noEffectCatchLadder: remediationMessage({
    detected: "Effect.catch wrapped around a multi-step sequencing chain.",
    problem: "the recovery boundary and the steps it handles are difficult to identify.",
    fix: "build one visible pipeline, then place one Effect.catch at the exact boundary whose typed errors it handles.",
    preserve: "which failures are recovered, recovery output type, defects, interruption, and requirements.",
  }),
  noEffectSucceedVariable: remediationMessage({
    detected: "Effect.succeed wrapping an existing identifier or member value.",
    problem: "inside branch-oriented code this often converts an already available value into a placeholder Effect.",
    fix: "select the plain value first with Match or Option, then enter one Effect pipeline after the decision.",
    preserve: "the selected value, absence semantics, branch conditions, and whether Effect construction is required by the surrounding type.",
  }),
  noEffectSyncConsole: remediationMessage({
    detected: "console output inside Effect.sync.",
    problem: "console calls bypass Effect logging metadata and configured loggers.",
    fix: "replace the console call with the matching Effect.log* operation, or remove it if it is temporary debugging.",
    preserve: "log level, message fields, execution order, and lazy execution.",
  }),
  preferEffectFn: remediationMessage({
    detected: "a reusable function whose body only returns Effect.gen.",
    problem: "the raw wrapper loses the observable function boundary and duplicates generator construction boilerplate.",
    fix: "define the operation with Effect.fn and place the generator body directly inside its callback.",
    preserve: "function name, parameters, laziness, typed errors, requirements, tracing intent, and return type.",
  }),
  noFlatmapLadder: remediationMessage({
    detected: "nested Effect.flatMap calls or Effect.flatten over a nested Effect.map.",
    problem: "nested callbacks hide the linear dependency between success values.",
    fix: "rewrite as one pipe with sequential Effect.flatMap steps and name only domain values needed by later steps.",
    preserve: "dependency order, short-circuit failures, typed errors, requirements, and final success value.",
  }),
  noNativeCurrentTime: remediationMessage({
    detected: "Date.now() or a zero-argument new Date() in an Effect ecosystem file.",
    problem: "reading wall-clock time directly bypasses Effect Clock and makes time-dependent behavior nondeterministic in tests.",
    fix: "read current time through Clock or DateTime inside the owning Effect; keep native Date only for explicit conversion of supplied values.",
    preserve: "instant precision, time-zone semantics, formatting, execution timing, and public date representation.",
  }),
  noEffectSleepInTest: remediationMessage({
    detected: "Effect.sleep using live time in a test file.",
    problem: "the test waits on wall-clock time and becomes slow or timing-dependent.",
    fix: "use TestClock with Effect sleep, or synchronize fibers with Deferred, Queue, Latch, or an explicit test hook.",
    preserve: "the delay boundary, ordering, timeout behavior, interruption, and assertion timing.",
  }),
  noEffectRunInTest: remediationMessage({
    detected: "an Effect.runPromise, runSync, or runCallback runtime call in a test file.",
    problem: "manual execution bypasses @effect/vitest test services, scoping, and structured failure reporting.",
    fix: "import test APIs from @effect/vitest and return the Effect from it.effect or it.live; use layer or it.layer for dependencies.",
    preserve: "test timeout, scope lifetime, provided services, exit behavior, assertions, and failure reporting.",
  }),
  noThrowInEffectGenerator: remediationMessage({
    detected: "a throw statement inside an Effect generator.",
    problem: "the thrown value becomes an unchecked defect instead of a typed failure in the Effect error channel.",
    fix: "return yield* a Schema.TaggedErrorClass failure; wrap throwing foreign APIs with Effect.try or Effect.tryPromise.",
    preserve: "failure payload, stack or cause evidence, branch termination, cleanup, and public error contract.",
  }),
  preferEffectAsync: remediationMessage({
    detected: "a native Promise constructor in an Effect ecosystem file.",
    problem: "manual Promise settlement hides cancellation and moves failure outside the typed Effect model.",
    fix: "use Effect.async for callback registration with a finalizer, Effect.tryPromise for Promise APIs, or a runtime bridge only at an external boundary.",
    preserve: "settlement timing, cancellation cleanup, rejection mapping, callback multiplicity, and result type.",
  }),
  preferAssertInEffectTest: remediationMessage({
    detected: "expect used inside an it.effect test.",
    problem: "Effect tests use @effect/vitest assert helpers for consistent synchronous assertions inside Effect workflows.",
    fix: "import assert from @effect/vitest and replace the assertion with the matching assert method.",
    preserve: "matcher semantics, equality depth, thrown-error checks, assertion count, and diagnostic value.",
  }),
  preferEffectCache: remediationMessage({
    detected: "a cache-named variable initialized with a native Map in an Effect ecosystem file.",
    problem: "manual caches usually duplicate keyed lookup deduplication, capacity, TTL, refresh, and eviction behavior already provided by Effect Cache.",
    fix: "use Cache.make or Cache.makeWith; use Effect.cached for one value and ScopedCache for resources requiring cleanup.",
    preserve: "cache key equality, capacity, success and failure TTLs, concurrent lookup deduplication, invalidation, and resource lifetime.",
  }),
  preferEffectChildProcess: remediationMessage({
    detected: "a direct node:child_process import in an Effect ecosystem file.",
    problem: "native process APIs bypass ChildProcessSpawner, typed platform errors, streams, scopes, and replaceable runtime services.",
    fix: "use effect/unstable/process ChildProcess and ChildProcessSpawner, then provide NodeChildProcessSpawner or NodeServices at the runtime boundary.",
    preserve: "command arguments, environment, cwd, stdio, exit codes, signals, streaming, and process cleanup.",
  }),
  preferEffectConfig: remediationMessage({
    detected: "direct process.env access in an Effect ecosystem file.",
    problem: "ambient environment reads bypass typed Config decoding and deterministic ConfigProvider replacement in tests.",
    fix: "define the value with Effect Config, use Config.redacted for secrets, and provide test values through ConfigProvider or an application config service.",
    preserve: "variable name, optionality, default behavior, redaction, parse failures, and startup timing.",
  }),
  preferEffectFileSystem: remediationMessage({
    detected: "a direct Node filesystem import in an Effect ecosystem file.",
    problem: "native filesystem calls bypass the Effect FileSystem service, typed platform errors, and replaceable test implementations.",
    fix: "depend on Effect FileSystem and provide NodeFileSystem or NodeServices at the runtime boundary.",
    preserve: "path handling, encoding, permissions, atomicity, streaming, error mapping, and resource cleanup.",
  }),
  preferEffectHttpClient: remediationMessage({
    detected: "a raw fetch call in an Effect ecosystem file.",
    problem: "raw fetch bypasses the Effect HttpClient service, typed transport errors, layers, tracing, retries, and schema response helpers.",
    fix: "use effect/unstable/http HttpClient with HttpClientRequest and HttpClientResponse; configure an exception only for a deliberate platform adapter.",
    preserve: "URL, method, headers, body, AbortSignal behavior, status classification, decoding, retries, and response type.",
  }),
  preferEffectScheduling: remediationMessage({
    detected: "setTimeout or setInterval in an Effect ecosystem file.",
    problem: "native timers bypass Effect Clock, interruption, scopes, Schedule, and deterministic TestClock control.",
    fix: "use Effect.sleep, Effect.delay, Effect.timeout, or Effect.repeat with Schedule; keep native timers only inside an explicit callback adapter with cleanup.",
    preserve: "delay duration, repetition cadence, cancellation, cleanup, callback order, and timeout semantics.",
  }),
  preferEffectDateTime: remediationMessage({
    detected: "Date.parse used in an Effect ecosystem file.",
    problem: "native parsing returns an unchecked number or NaN and bypasses DateTime or Schema validation.",
    fix: "use DateTime.make for optional parsing, DateTime.makeUnsafe only for trusted constants, or Schema.DateTimeUtcFromString at data boundaries.",
    preserve: "accepted input formats, UTC and zone semantics, invalid-input behavior, precision, and comparison logic.",
  }),
  preferEffectLogging: remediationMessage({
    detected: "a console call inside an Effect generator.",
    problem: "console output bypasses Effect log levels, annotations, spans, fiber context, and configured loggers.",
    fix: "use Effect.log, Effect.logDebug, Effect.logInfo, Effect.logWarning, or Effect.logError with structured fields.",
    preserve: "log level, message, structured fields, execution order, laziness, and diagnostic context.",
  }),
  preferEffectRandom: remediationMessage({
    detected: "Math.random used in an Effect ecosystem file.",
    problem: "ambient randomness cannot be replaced or made deterministic through Effect test services.",
    fix: "use the Effect Random service; keep cryptographic token generation in a focused crypto adapter rather than replacing it with Random.",
    preserve: "distribution, bounds, seeding expectations, security requirements, call count, and generated value type.",
  }),
  preferEffectTestLayer: remediationMessage({
    detected: "Effect.provide used directly inside a test file.",
    problem: "local provisioning repeats layer setup and hides scope ownership instead of using @effect/vitest layer helpers.",
    fix: "use layer for shared setup or it.layer for isolated or nested setup; keep provideService only for focused one-off overrides.",
    preserve: "layer sharing, memoization, acquisition count, finalizers, test isolation, and provided services.",
  }),
  preferEffectVitest: remediationMessage({
    detected: "Vitest APIs imported from vitest in an Effect test file.",
    problem: "plain Vitest lacks it.effect, it.live, Effect-aware property tests, layer helpers, TestClock, and scoped runtime handling.",
    fix: "import describe, it, assert, layer, and other test APIs from @effect/vitest; keep regular it for pure synchronous tests.",
    preserve: "test names, hooks, mocks, parameterization, timeouts, assertion behavior, and pure-test execution.",
  }),
  preferSchemaJson: remediationMessage({
    detected: "JSON.parse or JSON.stringify in an Effect ecosystem file.",
    problem: "raw JSON conversion bypasses Schema validation, transformations, typed parse errors, and model encoding rules.",
    fix: "use Schema.fromJsonString with decodeUnknownEffect or encodeUnknownEffect at the owning boundary; use NDJSON or stream codecs for streamed records.",
    preserve: "wire format, parse failures, optional fields, branded values, dates, whitespace, and compatibility with existing consumers.",
  }),
  noSchemaSyncInEffectGenerator: remediationMessage({
    detected: "a synchronous throwing Schema decoder or encoder inside an Effect generator.",
    problem: "sync Schema APIs can throw defects instead of keeping validation failure in the typed Effect error channel.",
    fix: "use Schema.decodeUnknownEffect or Schema.encodeUnknownEffect inside Effect code; reserve sync APIs for pure tests, scripts, or startup boundaries.",
    preserve: "schema options, encoded and decoded types, validation issues, transformations, and failure mapping.",
  }),
  noIifeWrapper: remediationMessage({
    detected: "an inline function invoked immediately.",
    problem: "the wrapper hides a local decision or sequence behind an unnecessary call boundary.",
    fix: "bind required inputs to named local values and keep the decision in one visible Match, Option, or Effect pipeline.",
    preserve: "evaluation timing, captured variables, return value, thrown failures, and side effects.",
  }),
  noInlineRuntimeProvide: remediationMessage({
    detected: "Effect.provide used inside a generator pipeline with one inline dependency argument.",
    problem: "local provisioning hides dependency assembly inside business logic.",
    fix: "provide the dependency once at the exported operation boundary or declare it through Context.Service and yield the service in the body.",
    preserve: "layer acquisition scope, finalizers, service identity, typed errors, and requirements.",
  }),
  noMatchEffectBranch: remediationMessage({
    detected: "a Match branch containing multiple Effect sequencing steps.",
    problem: "the branch mixes value selection with effect execution, hiding the shared continuation.",
    fix: "make Match select a plain domain value or operation, then run one Effect pipeline after the Match.",
    preserve: "pattern coverage, branch laziness, branch-specific inputs, typed errors, requirements, and output type.",
  }),
  noOptionEffectBranch: remediationMessage({
    detected: "an Option.match branch containing multiple Effect sequencing steps.",
    problem: "the branch mixes absence handling with effect execution, hiding the shared continuation.",
    fix: "make Option.match select a plain value or operation, then run one Effect pipeline after the match; keep a linear branch only when no shared continuation exists.",
    preserve: "none versus some semantics, branch laziness, typed errors, requirements, and output type.",
  }),
  requireReturnYieldEffectTerminal: remediationMessage({
    detected: "yield* Effect.fail or yield* Effect.interrupt used as a standalone generator statement.",
    problem: "the terminal Effect is not expressed as the generator's control-flow exit, leaving unreachable continuation code and weaker narrowing.",
    fix: "write return yield* Effect.fail(...) or return yield* Effect.interrupt at the terminal branch.",
    preserve: "typed failure, interruption semantics, branch condition, generator return type, and unreachable-code behavior.",
  }),
  noMatchVoidBranch: remediationMessage({
    detected: "a Match branch that returns Effect.void.",
    problem: "the no-op Effect encodes a guard branch without making the selected value explicit.",
    fix: "remove an unnecessary branch, or make Match select a value or operation and run the shared Effect pipeline afterward.",
    preserve: "pattern exhaustiveness, intentional no-op behavior, branch laziness, and output type.",
  }),
  noNestedEffectCall: remediationMessage({
    detected: "an Effect call nested at least three calls deep through first arguments.",
    problem: "the call tree hides sequencing and intermediate values.",
    fix: "rewrite it as one pipe with explicit Effect combinator steps.",
    preserve: "evaluation order, typed errors, requirements, concurrency, and final success value.",
  }),
  noOptionAs: remediationMessage({
    detected: "Option.as replacing a present Option value.",
    problem: "this project requires value replacement to remain explicit.",
    fix: "use Option.map(() => replacement), or Option.match when none and some require different outputs.",
    preserve: "none versus some semantics, laziness of replacement computation, and output type.",
  }),
  noPipeLadder: remediationMessage({
    detected: "a pipe() call nested inside an argument of another pipe() call.",
    problem: "nested pipelines split one data flow into multiple visual scopes.",
    fix: "flatten compatible steps into one pipe, or extract the inner pipeline as a complete named domain operation.",
    preserve: "evaluation order, callback scope, intermediate types, errors, and final value.",
  }),
  noReturnNull: remediationMessage({
    detected: "a return statement whose value is null.",
    problem: "null leaves absence or failure semantics implicit for callers.",
    fix: "use Option.none for expected absence, or Effect.fail with a typed error for failure; update the surrounding contract consistently.",
    preserve: "the distinction between absence and failure, public API compatibility, and caller control flow.",
  }),
  noEffectRunFork: remediationMessage({
    detected: "Effect.runFork or Effect.runForkWith inside an Effect ecosystem file.",
    problem: "starting a root fiber here detaches lifetime and failure observation from the surrounding structured flow.",
    fix: "inside Effect code use Effect.forkScoped; at the application boundary keep one intentional runFork/runForkWith entry point and configure this rule accordingly.",
    preserve: "fiber lifetime, interruption, failure observation, provided services, and application shutdown behavior.",
  }),
  noSwitchStatement: remediationMessage({
    detected: "a switch statement in an Effect ecosystem file.",
    problem: "case-based control flow sits outside the compositional data and Effect flow required by this project.",
    fix: "use Match.value, Option.match, Result.match, or Effect.if, then continue with one explicit pipeline.",
    preserve: "case order, default behavior, fallthrough semantics, narrowing, branch laziness, and output type.",
  }),
  noWrapGraphqlCatch: remediationMessage({
    detected: "Effect.catch after wrapGraphqlCall or an applyResponse sequencing step.",
    problem: "the catch can collapse structured GraphQL response errors after the response boundary has already classified them.",
    fix: "map each expected error in wrapGraphqlCall/applyResponse response handling and reserve Effect.catch for errors outside that envelope.",
    preserve: "GraphQL error categories, response metadata, defects, interruption, and the declared error channel.",
  }),
  warnEffectSyncWrapper: remediationMessage({
    detected: "Effect.sync whose body is a single non-console function call.",
    problem: "the generic wrapper does not identify the external side effect or its domain contract.",
    fix: "prefer a named integration function that returns Effect or a specific Effect API; keep Effect.sync only at the synchronous integration boundary.",
    preserve: "lazy execution, thrown-exception behavior, return value, call count, and execution order.",
  }),
};

function isInlineFunctionInvocation(node) {
  return node?.type === "CallExpression" && isFunction(unwrapExpression(node.callee));
}

function isEffectMember(node, methodName) {
  return isMember(node, "Effect", methodName);
}

function hasEffectFirstArgumentDepth(node, depth) {
  const expression = unwrapExpression(node);
  if (depth === 0) return true;
  if (!isEffectCall(expression)) return false;
  return hasEffectFirstArgumentDepth(expression.arguments[0], depth - 1);
}

function isSequentialSideEffect(node) {
  return (
    isCall(node, "Ref", "set") ||
    isCall(node, "Atom", "set") ||
    isCall(node, "SubscriptionRef", "set") ||
    isCall(node, "Reactivity", "invalidate") ||
    isCall(node, "Fiber", "interrupt") ||
    (node?.type === "CallExpression" && isMemberStartingWith(node.callee, "Effect", "log"))
  );
}

function hasConcurrencyOne(node) {
  return contains(
    node,
    (candidate) =>
      candidate.type === "Property" &&
      propertyName(candidate) === "concurrency" &&
      literalValue(candidate.value) === 1,
  );
}

function effectFnCallback(node) {
  const expression = unwrapExpression(node);
  if (expression?.type !== "CallExpression") return undefined;
  if (isEffectCall(expression, "fn")) {
    return unwrapExpression(expression.arguments[0]);
  }
  if (isEffectCall(unwrapExpression(expression.callee), "fn")) {
    return unwrapExpression(expression.arguments[0]);
  }
  return undefined;
}

function effectGenCallback(node) {
  const expression = unwrapExpression(node);
  if (!isEffectCall(expression, "gen")) return undefined;
  return unwrapExpression(expression.arguments[0]);
}

function isGlobalFunctionCall(node, functionName) {
  return (
    node?.type === "CallExpression" &&
    (isIdentifier(node.callee, functionName) ||
      isMember(node.callee, "globalThis", functionName))
  );
}

function isTestFile(filename) {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(filename ?? "");
}

function isItMethodCall(node, methodName) {
  return node?.type === "CallExpression" && isMember(node.callee, "it", methodName);
}

function isSchemaSyncCall(node) {
  return [
    "decodeSync",
    "decodeUnknownSync",
    "encodeSync",
    "encodeUnknownSync",
  ].some((methodName) => isCall(node, "Schema", methodName));
}

function directlyReturnedExpression(node) {
  if (!isFunction(node)) return undefined;
  if (node.body.type !== "BlockStatement") return unwrapExpression(node.body);
  if (node.body.body.length !== 1 || node.body.body[0].type !== "ReturnStatement") {
    return undefined;
  }
  return unwrapExpression(node.body.body[0].argument);
}

function onlyReturnsEffectGen(node) {
  return !node?.generator && isEffectCall(directlyReturnedExpression(node), "gen");
}

function isSequenceCall(node) {
  return (
    isEffectCall(node, "flatMap") ||
    isEffectCall(node, "map") ||
    isEffectCall(node, "andThen") ||
    isEffectCall(node, "tap") ||
    isPipeCall(node) ||
    (node?.type === "CallExpression" && identifierName(node.callee?.object) === "Stream")
  );
}

function callbackHasEffectSequence(call) {
  return call.arguments.some(
    (argument) =>
      isFunction(argument) &&
      contains(argument.body, isEffectCall) &&
      contains(argument.body, isSequenceCall),
  );
}

function matchPipelineHasEffectSequence(node) {
  if (!isPipeCall(node)) return false;
  const calleeObject = unwrapExpression(node.callee)?.object;
  if (!isCall(calleeObject, "Match", "value")) return false;
  return contains(
    node.arguments,
    (candidate) =>
      (isCall(candidate, "Match", "when") || isCall(candidate, "Match", "orElse")) &&
      callbackHasEffectSequence(candidate),
  );
}

function optionMatchHasEffectSequence(node) {
  return (
    isCall(node, "Option", "match") &&
    contains(node.arguments, isEffectCall) &&
    contains(node.arguments, isSequenceCall)
  );
}

function isConsoleCall(node) {
  return node?.type === "CallExpression" && identifierName(node.callee?.object) === "console";
}

export const coreRules = {
  "no-arrow-ladder": defineEffectFileRule(messages.noArrowLadder, (_context, report, enabled) => ({
    CallExpression(node) {
      if (!enabled() || !isInlineFunctionInvocation(node)) return;
      const inlineFunction = unwrapExpression(node.callee);
      const nested = isInlineFunctionInvocation(inlineFunction.body)
        ? inlineFunction.body
        : findDescendant(inlineFunction.body, isInlineFunctionInvocation);
      if (nested) report(nested);
    },
  })),

  "no-call-tower": defineRule(messages.noCallTower, (_context, report) => ({
    CallExpression(node) {
      if (!isEffectCall(node)) return;
      if (node.arguments.slice(0, 2).some((argument) => isEffectCall(argument))) report(node);
    },
  })),

  "no-effect-all-step-sequencing": defineRule(
    messages.noEffectAllStepSequencing,
    (_context, report) => ({
      CallExpression(node) {
        if (isEffectCall(node, "all")) {
          const [steps, options] = node.arguments;
          if (options && hasConcurrencyOne(options) && contains(steps, isSequentialSideEffect)) {
            report(node);
          }
          return;
        }

        if (!isPipeCall(node) || !isEffectCall(unwrapExpression(node.callee)?.object, "all")) {
          return;
        }
        const effectAll = unwrapExpression(node.callee).object;
        if (
          node.arguments.some((argument) => isEffectMember(argument, "asVoid")) &&
          contains(effectAll.arguments[0], isSequentialSideEffect)
        ) {
          report(node);
        }
      },
    }),
  ),

  "no-effect-as": defineRule(messages.noEffectAs, (_context, report) => ({
    CallExpression(node) {
      if (isEffectCall(node, "as")) report(node);
    },
  })),

  "no-effect-callback": defineEffectFileRule(messages.noEffectCallback, (_context, report, enabled) => ({
    CallExpression(node) {
      if (enabled() && isEffectCall(node, "callback")) report(node);
    },
  })),

  "no-effect-bind": defineEffectFileRule(messages.noEffectBind, (_context, report, enabled) => ({
    CallExpression(node) {
      if (enabled() && isEffectCall(node, "bind")) report(node);
    },
  })),

  "no-effect-do": defineEffectFileRule(messages.noEffectDo, (_context, report, enabled) => ({
    MemberExpression(node) {
      if (enabled() && isMember(node, "Effect", "Do")) report(node);
    },
  })),

  "no-effect-fn-callback-alias": defineEffectFileRule(
    messages.noEffectFnCallbackAlias,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (!enabled()) return;
        const callback = effectFnCallback(node);
        if (callback?.type === "Identifier") report(callback);
      },
    }),
  ),

  "no-effect-fn-untraced": defineEffectFileRule(
    messages.noEffectFnUntraced,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (enabled() && isEffectCall(node, "fnUntraced")) report(node);
      },
    }),
  ),

  "no-effect-gen-callback-alias": defineEffectFileRule(
    messages.noEffectGenCallbackAlias,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (!enabled()) return;
        const callback = effectGenCallback(node);
        if (callback?.type === "Identifier") report(callback);
      },
    }),
  ),

  "no-effect-ladder": defineRule(messages.noEffectLadder, (_context, report) => ({
    VariableDeclaration(node) {
      if (!isConstDeclaration(node)) return;
      if (node.declarations.some((declarator) => hasEffectFirstArgumentDepth(declarator.init, 3))) {
        report(node);
      }
    },
    ReturnStatement(node) {
      if (hasEffectFirstArgumentDepth(node.argument, 3)) report(node);
    },
  })),

  "no-effect-never": defineEffectFileRule(messages.noEffectNever, (_context, report, enabled) => ({
    MemberExpression(node) {
      if (enabled() && isMember(node, "Effect", "never")) report(node);
    },
  })),

  "no-effect-catch-ladder": defineRule(messages.noEffectCatchLadder, (_context, report) => ({
    CallExpression(node) {
      const isSequencingCall = (candidate) =>
        isEffectCall(candidate, "flatMap") ||
        isEffectCall(candidate, "andThen") ||
        isEffectCall(candidate, "as") ||
        isEffectCall(candidate, "tap");

      if (isEffectCall(node, "catch") && node.arguments.length >= 2) {
        if (contains(node.arguments[0], isSequencingCall)) report(node);
        return;
      }

      if (isPipeCall(node) && contains(node, isSequencingCall)) {
        collect(node.arguments, (candidate) => isEffectCall(candidate, "catch")).forEach(
          (catchCall) => report(catchCall),
        );
      }
    },
  })),

  "no-effect-succeed-variable": defineEffectFileRule(
    messages.noEffectSucceedVariable,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (!enabled() || !isEffectCall(node, "succeed")) return;
        const value = unwrapExpression(node.arguments[0]);
        if (value?.type === "Identifier" || value?.type === "MemberExpression") report(node);
      },
    }),
  ),

  "no-effect-sync-console": defineEffectFileRule(
    messages.noEffectSyncConsole,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (enabled() && isEffectCall(node, "sync") && contains(node.arguments[0], isConsoleCall)) {
          report(node);
        }
      },
    }),
  ),

  "prefer-effect-fn": defineEffectFileRule(messages.preferEffectFn, (_context, report, enabled) => ({
    VariableDeclarator(node) {
      if (enabled() && onlyReturnsEffectGen(unwrapExpression(node.init))) report(node);
    },
    FunctionDeclaration(node) {
      if (enabled() && onlyReturnsEffectGen(node)) report(node);
    },
  })),

  "no-flatmap-ladder": defineRule(messages.noFlatmapLadder, (_context, report) => ({
    VariableDeclaration(node) {
      if (!isConstDeclaration(node)) return;
      for (const declarator of node.declarations) {
        const initializer = unwrapExpression(declarator.init);
        if (
          (isEffectCall(initializer, "flatMap") &&
            findDescendant(initializer, (candidate) => isEffectCall(candidate, "flatMap"))) ||
          (isEffectCall(initializer, "flatten") &&
            contains(initializer.arguments[0], (candidate) => isEffectCall(candidate, "map")))
        ) {
          report(node);
          return;
        }
      }
    },
    ReturnStatement(node) {
      const expression = unwrapExpression(node.argument);
      if (
        (isEffectCall(expression, "flatMap") &&
          findDescendant(expression, (candidate) => isEffectCall(candidate, "flatMap"))) ||
        (isEffectCall(expression, "flatten") &&
          contains(expression.arguments[0], (candidate) => isEffectCall(candidate, "map")))
      ) {
        report(node);
      }
    },
  })),

  "no-iife-wrapper": defineEffectFileRule(messages.noIifeWrapper, (_context, report, enabled) => ({
    CallExpression(node) {
      if (enabled() && isInlineFunctionInvocation(node)) report(node);
    },
  })),

  "no-inline-runtime-provide": defineEffectFileRule(
    messages.noInlineRuntimeProvide,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (!enabled() || !isEffectCall(node, "provide") || node.arguments.length !== 1) return;
        const inGenerator = hasAncestor(node, (ancestor) => isFunction(ancestor) && ancestor.generator);
        const inPipe = hasAncestor(node, isPipeCall);
        if (inGenerator && inPipe) report(node);
      },
    }),
  ),

  "no-match-effect-branch": defineRule(messages.noMatchEffectBranch, (_context, report) => ({
    CallExpression(node) {
      if (matchPipelineHasEffectSequence(node)) report(node);
    },
  })),

  "no-option-effect-branch": defineRule(messages.noOptionEffectBranch, (_context, report) => ({
    CallExpression(node) {
      if (optionMatchHasEffectSequence(node)) report(node);
    },
  })),

  "no-match-void-branch": defineEffectFileRule(
    messages.noMatchVoidBranch,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (!enabled()) return;
        const matchWhen = isCall(node, "Match", "when");
        const matchOrElse = isCall(node, "Match", "orElse");
        if (!matchWhen && !matchOrElse) return;
        if (
          matchWhen &&
          ![true, false].includes(literalValue(node.arguments[0]))
        ) {
          return;
        }
        if (
          node.arguments.some(
            (argument) =>
              isFunction(argument) && isMember(returnedExpression(argument), "Effect", "void"),
          )
        ) {
          report(node);
        }
      },
    }),
  ),

  "no-native-current-time": defineEffectFileRule(
    messages.noNativeCurrentTime,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (enabled() && isMember(node.callee, "Date", "now")) report(node);
      },
      NewExpression(node) {
        if (enabled() && isIdentifier(node.callee, "Date") && node.arguments.length === 0) {
          report(node);
        }
      },
    }),
  ),

  "no-effect-sleep-in-test": defineEffectFileRule(
    messages.noEffectSleepInTest,
    (context, report, enabled) => ({
      CallExpression(node) {
        if (
          enabled() &&
          isTestFile(context.filename) &&
          !hasAncestor(node, (ancestor) => isItMethodCall(ancestor, "live")) &&
          isEffectCall(node, "sleep")
        ) {
          report(node);
        }
      },
    }),
  ),

  "no-effect-run-in-test": defineEffectFileRule(
    messages.noEffectRunInTest,
    (context, report, enabled) => ({
      CallExpression(node) {
        if (!enabled() || !isTestFile(context.filename) || !isEffectCall(node)) return;
        const method = memberName(node.callee);
        if (method && /^run(?:Promise|Sync|Callback)/.test(method)) report(node);
      },
    }),
  ),

  "no-throw-in-effect-generator": defineEffectFileRule(
    messages.noThrowInEffectGenerator,
    (_context, report, enabled) => ({
      ThrowStatement(node) {
        if (enabled() && hasAncestor(node, (ancestor) => isFunction(ancestor) && ancestor.generator)) {
          report(node);
        }
      },
    }),
  ),

  "no-nested-effect-call": defineEffectFileRule(
    messages.noNestedEffectCall,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (enabled() && hasEffectFirstArgumentDepth(node, 3)) report(node);
      },
    }),
  ),

  "no-option-as": defineEffectFileRule(messages.noOptionAs, (_context, report, enabled) => ({
    CallExpression(node) {
      if (enabled() && isCall(node, "Option", "as")) report(node);
    },
  })),

  "no-pipe-ladder": defineRule(messages.noPipeLadder, (_context, report) => ({
    CallExpression(node) {
      if (!isPipeCall(node)) return;
      for (const argument of node.arguments) {
        for (const nested of collect(argument, isPipeCall)) report(nested);
      }
    },
  })),

  "prefer-effect-async": defineEffectFileRule(
    messages.preferEffectAsync,
    (_context, report, enabled) => ({
      NewExpression(node) {
        if (enabled() && isIdentifier(node.callee, "Promise")) report(node);
      },
    }),
  ),

  "prefer-assert-in-effect-test": defineEffectFileRule(
    messages.preferAssertInEffectTest,
    (context, report, enabled) => ({
      CallExpression(node) {
        if (
          enabled() &&
          isTestFile(context.filename) &&
          isIdentifier(node.callee, "expect") &&
          hasAncestor(node, (ancestor) => isItMethodCall(ancestor, "effect"))
        ) {
          report(node);
        }
      },
    }),
  ),

  "prefer-effect-cache": defineEffectFileRule(
    messages.preferEffectCache,
    (_context, report, enabled) => ({
      VariableDeclarator(node) {
        if (
          enabled() &&
          node.id?.type === "Identifier" &&
          /cache/i.test(node.id.name) &&
          unwrapExpression(node.init)?.type === "NewExpression" &&
          isIdentifier(unwrapExpression(node.init).callee, "Map")
        ) {
          report(node);
        }
      },
    }),
  ),

  "prefer-effect-child-process": defineEffectFileRule(
    messages.preferEffectChildProcess,
    (_context, report, enabled) => ({
      ImportDeclaration(node) {
        if (enabled() && ["child_process", "node:child_process"].includes(literalValue(node.source))) {
          report(node);
        }
      },
    }),
  ),

  "prefer-effect-config": defineEffectFileRule(
    messages.preferEffectConfig,
    (_context, report, enabled) => ({
      MemberExpression(node) {
        if (enabled() && isMember(node, "process", "env")) report(node);
      },
    }),
  ),

  "prefer-effect-file-system": defineEffectFileRule(
    messages.preferEffectFileSystem,
    (_context, report, enabled) => ({
      ImportDeclaration(node) {
        if (!enabled()) return;
        const source = literalValue(node.source);
        if (["fs", "fs/promises", "node:fs", "node:fs/promises"].includes(source)) {
          report(node);
        }
      },
    }),
  ),

  "prefer-effect-http-client": defineEffectFileRule(
    messages.preferEffectHttpClient,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (enabled() && isGlobalFunctionCall(node, "fetch")) report(node);
      },
    }),
  ),

  "prefer-effect-scheduling": defineEffectFileRule(
    messages.preferEffectScheduling,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (
          enabled() &&
          (isGlobalFunctionCall(node, "setTimeout") ||
            isGlobalFunctionCall(node, "setInterval"))
        ) {
          report(node);
        }
      },
    }),
  ),

  "prefer-effect-date-time": defineEffectFileRule(
    messages.preferEffectDateTime,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (enabled() && isMember(node.callee, "Date", "parse")) report(node);
      },
    }),
  ),

  "prefer-effect-logging": defineEffectFileRule(
    messages.preferEffectLogging,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (
          enabled() &&
          isConsoleCall(node) &&
          hasAncestor(node, (ancestor) => isFunction(ancestor) && ancestor.generator)
        ) {
          report(node);
        }
      },
    }),
  ),

  "prefer-effect-random": defineEffectFileRule(
    messages.preferEffectRandom,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (enabled() && isMember(node.callee, "Math", "random")) report(node);
      },
    }),
  ),

  "prefer-effect-test-layer": defineEffectFileRule(
    messages.preferEffectTestLayer,
    (context, report, enabled) => ({
      CallExpression(node) {
        if (enabled() && isTestFile(context.filename) && isEffectCall(node, "provide")) {
          report(node);
        }
      },
    }),
  ),

  "prefer-effect-vitest": defineEffectFileRule(
    messages.preferEffectVitest,
    (context, report, enabled) => ({
      ImportDeclaration(node) {
        if (enabled() && isTestFile(context.filename) && literalValue(node.source) === "vitest") {
          report(node);
        }
      },
    }),
  ),

  "prefer-schema-json": defineEffectFileRule(
    messages.preferSchemaJson,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (
          enabled() &&
          (isCall(node, "JSON", "parse") || isCall(node, "JSON", "stringify"))
        ) {
          report(node);
        }
      },
    }),
  ),

  "no-schema-sync-in-effect-generator": defineEffectFileRule(
    messages.noSchemaSyncInEffectGenerator,
    (context, report, enabled) => ({
      CallExpression(node) {
        if (
          enabled() &&
          !isTestFile(context.filename) &&
          isSchemaSyncCall(node) &&
          hasAncestor(node, (ancestor) => isFunction(ancestor) && ancestor.generator)
        ) {
          report(node);
        }
      },
    }),
  ),

  "require-return-yield-effect-terminal": defineEffectFileRule(
    messages.requireReturnYieldEffectTerminal,
    (_context, report, enabled) => ({
      ExpressionStatement(node) {
        if (!enabled() || node.expression?.type !== "YieldExpression") return;
        const terminal = unwrapExpression(node.expression.argument);
        if (isEffectCall(terminal, "fail") || isMember(terminal, "Effect", "interrupt")) {
          report(node);
        }
      },
    }),
  ),

  "no-return-null": defineEffectFileRule(messages.noReturnNull, (_context, report, enabled) => ({
    ReturnStatement(node) {
      if (enabled() && literalValue(node.argument) === null) report(node);
    },
  })),

  "no-effect-runfork": defineEffectFileRule(
    messages.noEffectRunFork,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (
          enabled() &&
          (isEffectCall(node, "runFork") || isEffectCall(node, "runForkWith"))
        ) {
          report(node);
        }
      },
    }),
  ),

  "no-switch-statement": defineEffectFileRule(
    messages.noSwitchStatement,
    (_context, report, enabled) => ({
      SwitchStatement(node) {
        if (enabled()) report(node);
      },
    }),
  ),

  "no-wrapgraphql-catch": defineEffectFileRule(
    messages.noWrapGraphqlCatch,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (!enabled() || !isPipeCall(node)) return;
        const catchCalls = collect(node, (candidate) => isEffectCall(candidate, "catch"));
        if (catchCalls.length === 0) return;
        const hasEnvelope =
          contains(node, (candidate) => isCall(candidate, "wrapGraphqlCall")) ||
          contains(
            node,
            (candidate) =>
              isEffectCall(candidate, "flatMap") &&
              candidate.arguments.some((argument) => isIdentifier(argument, "applyResponse")),
          );
        if (hasEnvelope) catchCalls.forEach((call) => report(call));
      },
    }),
  ),

  "warn-effect-sync-wrapper": defineEffectFileRule(
    messages.warnEffectSyncWrapper,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (!enabled() || !isEffectCall(node, "sync")) return;
        const callback = unwrapExpression(node.arguments[0]);
        if (callback?.type !== "ArrowFunctionExpression") return;
        const body = unwrapExpression(callback.body);
        if (body?.type === "CallExpression" && !isConsoleCall(body)) report(node);
      },
    }),
  ),
};
