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
  noEffectFnGenerator: remediationMessage({
    detected: "Effect.fn wrapping a generator function.",
    problem: "the extra function wrapper obscures the operation boundary and nested sequencing.",
    fix: "keep the function boundary explicit and return one flat Effect pipeline or one Effect.gen body.",
    preserve: "function parameters, tracing behavior, laziness, typed errors, requirements, and return type.",
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
  noEffectWrapperAlias: remediationMessage({
    detected: "a local declaration that only aliases an Effect pipeline or returns one unchanged.",
    problem: "the extra name forces readers to jump between declarations without adding a domain boundary.",
    fix: "inline the pipeline at its single use, or keep a named function only when its name, parameters, and contract define a real reusable operation.",
    preserve: "laziness, call count, parameter scope, typed errors, requirements, and reuse semantics.",
  }),
  noFlatmapLadder: remediationMessage({
    detected: "nested Effect.flatMap calls or Effect.flatten over a nested Effect.map.",
    problem: "nested callbacks hide the linear dependency between success values.",
    fix: "rewrite as one pipe with sequential Effect.flatMap steps and name only domain values needed by later steps.",
    preserve: "dependency order, short-circuit failures, typed errors, requirements, and final success value.",
  }),
  noIfStatement: remediationMessage({
    detected: "an if statement in an Effect ecosystem file.",
    problem: "the branch sits outside the compositional data and Effect flow required by this project.",
    fix: "select a value with Match.value, Option.match, Result.match, or Effect.if, then continue with one pipeline.",
    preserve: "condition evaluation, branch laziness, side effects, narrowing, and both branch result types.",
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
  noNestedEffectGen: remediationMessage({
    detected: "Effect.gen nested inside another Effect.gen callback.",
    problem: "the nested generator creates a second sequencing scope inside one operation.",
    fix: "move the nested yields into the owning generator, or extract a complete named domain operation when it is independently reusable.",
    preserve: "yield order, local variable scope, typed errors, requirements, finalizers, and return value.",
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
  noTernary: remediationMessage({
    detected: "a conditional expression in an Effect ecosystem file.",
    problem: "the inline branch hides selection inside a larger expression.",
    fix: "select the value with Match.value, Option.match, Result.match, or Effect.if before continuing the pipeline.",
    preserve: "condition evaluation, branch laziness, narrowing, side effects, and output type.",
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

function isEffectPipelineExpression(node) {
  const expression = unwrapExpression(node);
  if (isEffectCall(expression)) return true;
  return isPipeCall(expression) && contains(expression, isEffectCall);
}

function isEffectReturningArrow(node) {
  return (
    node?.type === "ArrowFunctionExpression" &&
    node.body.type !== "BlockStatement" &&
    isEffectPipelineExpression(node.body)
  );
}

function isEffectReturningDeclaration(node) {
  return (
    node?.type === "FunctionDeclaration" &&
    node.body.body.length === 1 &&
    node.body.body[0].type === "ReturnStatement" &&
    isEffectPipelineExpression(node.body.body[0].argument)
  );
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

  "no-effect-fn-generator": defineEffectFileRule(
    messages.noEffectFnGenerator,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (
          enabled() &&
          isEffectCall(node, "fn") &&
          node.arguments.some((argument) => isFunction(argument) && argument.generator)
        ) {
          report(node);
        }
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

  "no-effect-wrapper-alias": defineRule(messages.noEffectWrapperAlias, (_context, report) => ({
    VariableDeclaration(node) {
      if (!isConstDeclaration(node)) return;
      if (
        node.declarations.some((declarator) => {
          const initializer = unwrapExpression(declarator.init);
          return (
            (isPipeCall(initializer) && contains(initializer, isEffectCall)) ||
            isEffectReturningArrow(initializer)
          );
        })
      ) {
        report(node);
      }
    },
    FunctionDeclaration(node) {
      if (isEffectReturningDeclaration(node)) report(node);
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

  "no-if-statement": defineEffectFileRule(messages.noIfStatement, (_context, report, enabled) => ({
    IfStatement(node) {
      if (enabled()) report(node.test);
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

  "no-nested-effect-call": defineEffectFileRule(
    messages.noNestedEffectCall,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (enabled() && hasEffectFirstArgumentDepth(node, 3)) report(node);
      },
    }),
  ),

  "no-nested-effect-gen": defineEffectFileRule(
    messages.noNestedEffectGen,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (!enabled() || !isEffectCall(node, "gen")) return;
        const callback = node.arguments.find(isFunction);
        const nested = callback && findDescendant(callback.body, (candidate) => isEffectCall(candidate, "gen"));
        if (nested) report(nested);
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

  "no-ternary": defineEffectFileRule(messages.noTernary, (_context, report, enabled) => ({
    ConditionalExpression(node) {
      if (enabled()) report(node.test);
    },
  })),

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
