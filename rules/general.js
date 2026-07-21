import {
  contains,
  identifierName,
  isCall,
  isConstDeclaration,
  isEffectCall,
  isFunction,
  isMember,
  isMemberStartingWith,
  isPipeCall,
  memberName,
  returnedExpression,
  unwrapExpression,
  variableIdentifier,
} from "../lib/ast.js";
import { defineRule, remediationMessage } from "./rule.js";

const messages = {
  noBranchInObject: remediationMessage({
    detected: "Match, Option.match, or Result.match used directly as an object property value.",
    problem: "the object construction hides the decision that determines one of its fields.",
    fix: "compute the selected field value first, then construct the object from named values.",
    preserve: "branch laziness, none/failure semantics, narrowing, property type, and object construction timing.",
  }),
  noEffectAsSideEffect: remediationMessage({
    detected: "Effect.as applied to an Effect containing an obvious state, invalidation, logging, or console side effect.",
    problem: "value replacement hides the side-effecting step and discards its result.",
    fix: "make the side effect a visible pipeline step with Effect.tap, Effect.andThen, or Effect.flatMap, then map the final value explicitly.",
    preserve: "side-effect order, lazy execution, failure propagation, requirements, and required output value.",
  }),
  noEffectAndThenSideEffect: remediationMessage({
    detected: "data-first Effect.andThen whose first argument contains an obvious side effect.",
    problem: "the nested first argument hides the side-effecting step inside the combinator call.",
    fix: "start from the side-effecting Effect and make subsequent work visible in one pipe with Effect.andThen, Effect.tap, or Effect.flatMap.",
    preserve: "side-effect order, discarded versus retained values, lazy execution, failures, and requirements.",
  }),
  noFragmentedConstAssembly: remediationMessage({
    detected: "an object literal spreading the result of a function call.",
    problem: "the final object contract is split between the object and an opaque generated fragment.",
    fix: "construct the complete object in one visible block, or call one stable domain constructor whose signature defines the complete contract.",
    preserve: "property precedence, getter evaluation, optional fields, prototype behavior, and final object type.",
  }),
  noPipelineFragmentStaging: remediationMessage({
    detected: "a local pipe result stored in a const and later consumed by another returned pipe in the same block.",
    problem: "the operation is split into pipeline fragments that must be mentally reassembled.",
    fix: "join producer and consumer into one visible pipeline, or extract a complete named operation instead of an intermediate fragment.",
    preserve: "evaluation order, intermediate type narrowing, lazy callbacks, failures, and final output.",
  }),
  noReturnInArrow: remediationMessage({
    detected: "a return statement inside a block-bodied arrow callback.",
    problem: "the callback's result path is less visible than an expression callback and may contain hidden early exits.",
    fix: "convert to an expression body when behavior is equivalent; otherwise extract a named function or configure an exception when the block is clearer.",
    preserve: "early-return behavior, callback this semantics, side effects, async or Effect behavior, and return type.",
  }),
  noReturnInCallback: remediationMessage({
    detected: "a return statement inside an inline function-expression callback.",
    problem: "the callback hides a control-flow boundary inside a call argument.",
    fix: "use an expression-only callback when equivalent, or extract a named function when multiple statements or early exits are required.",
    preserve: "this binding, early returns, side effects, async or Effect behavior, and return type.",
  }),
  noTryCatch: remediationMessage({
    detected: "a try/catch statement.",
    problem: "thrown failures and recovery are outside the typed Effect error channel required by this project.",
    fix: "capture synchronous throws with Effect.try, promises with Effect.tryPromise, and recover typed failures with Effect.catch or tagged error combinators.",
    preserve: "which exceptions are caught, finally behavior, error mapping, defects, interruption, and return type.",
  }),
  preventDynamicImports: remediationMessage({
    detected: "a dynamic import() expression.",
    problem: "the module dependency and loading path are hidden behind runtime control flow.",
    fix: "use a static import at the file boundary; if deferred loading is required, configure an explicit exception rather than changing load timing silently.",
    preserve: "lazy loading, chunk boundaries, startup cost, side effects, and error behavior.",
  }),
};

function isDecisionExpression(node) {
  if (isCall(node, "Option", "match") || isCall(node, "Result", "match")) return true;
  if (!isPipeCall(node)) return false;
  return isCall(unwrapExpression(node.callee)?.object, "Match", "value");
}

function isObjectReturningIife(node) {
  if (node?.type !== "CallExpression" || !isFunction(unwrapExpression(node.callee))) return false;
  const returned = unwrapExpression(returnedExpression(unwrapExpression(node.callee)));
  return returned?.type === "ObjectExpression";
}

function isObviousSideEffect(node) {
  if (node?.type !== "CallExpression") return false;
  const calleeName = identifierName(node.callee);
  return (
    calleeName === "setState" ||
    isCall(node, "Atom", "set") ||
    calleeName === "invalidate" ||
    memberName(node.callee) === "invalidate" ||
    isMemberStartingWith(node.callee, "Effect", "log") ||
    identifierName(node.callee?.object) === "console"
  );
}

function isSchemaFilterCall(node) {
  return isMember(node, "S", "filter") || isMember(node, "Schema", "filter");
}

function returnStatementsInOwnBody(functionNode) {
  const returns = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node !== functionNode && isFunction(node)) return;
    if (node.type === "ReturnStatement") {
      returns.push(node);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (["parent", "tokens", "comments"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  visit(functionNode.body);
  return returns;
}

export const generalRules = {
  "no-branch-in-object": defineRule(messages.noBranchInObject, (_context, report) => ({
    Property(node) {
      if (isDecisionExpression(unwrapExpression(node.value))) report(node);
    },
    CallExpression(node) {
      if (
        isObjectReturningIife(node) &&
        node.arguments.some((argument) => contains(argument, isDecisionExpression))
      ) {
        report(node);
      }
    },
  })),

  "no-effect-side-effect-wrapper": defineRule(
    messages.noEffectAsSideEffect,
    (_context, report) => ({
      CallExpression(node) {
        const isEffectAs = isEffectCall(node, "as");
        const isEffectAndThen = isEffectCall(node, "andThen") && node.arguments.length >= 2;
        if (!isEffectAs && !isEffectAndThen) return;
        if (!contains(node.arguments[0], isObviousSideEffect)) return;
        report(node, isEffectAs ? messages.noEffectAsSideEffect : messages.noEffectAndThenSideEffect);
      },
    }),
  ),

  "no-fragmented-const-assembly": defineRule(
    messages.noFragmentedConstAssembly,
    (_context, report) => ({
      ObjectExpression(node) {
        if (
          node.properties.some(
            (property) =>
              property.type === "SpreadElement" &&
              unwrapExpression(property.argument)?.type === "CallExpression",
          )
        ) {
          report(node);
        }
      },
    }),
  ),

  "no-pipeline-fragment-staging": defineRule(
    messages.noPipelineFragmentStaging,
    (_context, report) => ({
      BlockStatement(node) {
        const fragments = new Set();
        for (const statement of node.body) {
          if (!isConstDeclaration(statement)) continue;
          for (const declarator of statement.declarations) {
            if (isPipeCall(unwrapExpression(declarator.init))) {
              const name = variableIdentifier(declarator);
              if (name) fragments.add(name);
            }
          }
        }
        if (fragments.size === 0) return;
        const returnsFragmentPipeline = node.body.some(
          (statement) =>
            statement.type === "ReturnStatement" &&
            isPipeCall(unwrapExpression(statement.argument)) &&
            contains(statement.argument, (candidate) => {
              const name = identifierName(candidate);
              return name !== undefined && fragments.has(name);
            }),
        );
        if (returnsFragmentPipeline) report(node);
      },
    }),
  ),

  "no-return-in-arrow": defineRule(messages.noReturnInArrow, (_context, report) => ({
    CallExpression(node) {
      if (isSchemaFilterCall(node.callee)) return;
      for (const argument of node.arguments) {
        if (argument?.type !== "ArrowFunctionExpression" || argument.body.type !== "BlockStatement") {
          continue;
        }
        returnStatementsInOwnBody(argument).forEach((returnStatement) => report(returnStatement));
      }
    },
  })),

  "no-return-in-callback": defineRule(messages.noReturnInCallback, (_context, report) => ({
    CallExpression(node) {
      for (const argument of node.arguments) {
        if (argument?.type !== "FunctionExpression" || argument.generator) continue;
        returnStatementsInOwnBody(argument).forEach((returnStatement) => report(returnStatement));
      }
    },
  })),

  "no-try-catch": defineRule(messages.noTryCatch, (_context, report) => ({
    TryStatement(node) {
      if (node.handler) report(node);
    },
  })),

  "prevent-dynamic-imports": defineRule(messages.preventDynamicImports, (_context, report) => ({
    ImportExpression(node) {
      report(node);
    },
  })),
};
