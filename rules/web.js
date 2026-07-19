import {
  collect,
  contains,
  hasAncestor,
  identifierName,
  isCall,
  isEffectCall,
  isFunction,
  isIdentifier,
  isPipeCall,
  memberName,
  returnedExpression,
  staticText,
  unwrapExpression,
} from "../lib/ast.js";
import { defineEffectFileRule, defineRule, remediationMessage } from "./rule.js";

const messages = {
  noAtomRegistryEffectSync: remediationMessage({
    detected: "Atom.get/set/update/modify/refresh or atomRegistry operations wrapped inside Effect.sync.",
    problem: "v4 Atom operations already return Effects, so Effect.sync creates an unnecessary nested or opaque effect boundary.",
    fix: "compose the Atom operation directly in the pipeline without Effect.sync.",
    preserve: "AtomRegistry requirements, lazy execution, update atomicity, return values, and operation order.",
  }),
  noFamilyCollectionRead: remediationMessage({
    detected: "an Atom.family callback reading an atom whose name indicates a collection, list, aggregate, or result set.",
    problem: "a keyed row projection now depends on the whole collection and can recompute for unrelated item changes.",
    fix: "read a keyed source or index atom such as SourceAtom, ByKeyAtom, or IndexAtom; if the family is intentionally list-scoped, rename or restructure it to make that scope explicit.",
    preserve: "family key identity, missing-item behavior, subscription granularity, ordering, and cache lifetime.",
  }),
  noNakedObjectStateUpdate: remediationMessage({
    detected: "a raw object rebuild or JSON shortcut in state-oriented code.",
    problem: "the operation bypasses explicit model and schema contracts.",
    fix: "use the trigger-specific remediation in this diagnostic and keep state transitions or serialization at their owning boundary.",
    preserve: "object semantics, model identity, runtime validation, serialization compatibility, and update atomicity.",
  }),
  noRefSpreadUpdate: remediationMessage({
    detected: "Ref.update or Ref.modify returning an object built with spread syntax.",
    problem: "the state transition hides which fields change and bypasses model constructors.",
    fix: "express named field changes with Struct.evolve and effect/Record operations, or rebuild through the owning Schema/model constructor.",
    preserve: "unchanged fields, readonly or branded identity, update atomicity, return value, and structural sharing.",
  }),
  noEntriesRoundTrip: remediationMessage({
    detected: "Object.fromEntries applied to data produced from Object.entries.",
    problem: "the round trip erases key/value precision and hides the intended record transformation.",
    fix: "use effect/Record map, filter, set, modify, or remove operations that state the transformation directly.",
    preserve: "key coercion, symbol handling, property order, omitted entries, and value types.",
  }),
  noObjectAssignMerge: remediationMessage({
    detected: "Object.assign({}, ...) used to merge three or more objects.",
    problem: "the merge hides field ownership and overwrite precedence in a generic mutable API.",
    fix: "construct the complete model explicitly, use Struct.evolve for named fields, or use effect/Record operations for a true record.",
    preserve: "left-to-right overwrite precedence, enumerable properties, getters, symbols, prototype behavior, and output type.",
  }),
  noJsonShortcut: remediationMessage({
    detected: "JSON.parse or JSON.stringify in state-oriented code.",
    problem: "raw JSON conversion bypasses schema validation, typed parse errors, and model encoding rules.",
    fix: "decode and encode at the boundary with the owning Schema APIs.",
    preserve: "wire format, parse failures, optional fields, dates or branded values, and compatibility with existing consumers.",
  }),
  noReactState: remediationMessage({
    detected: "a React state, context, lifecycle, callback, or external-store hook governed by this rule.",
    problem: "this project requires shared reactive state and effects to be owned by the Effect Atom runtime.",
    fix: "move the responsibility to an Atom or Effect operation and consume it through @effect/atom-react; do not replace unlike hooks mechanically.",
    preserve: "component-local versus shared ownership, React lifecycle timing, cleanup, memoization, subscriptions, and render behavior.",
  }),
  noRenderSideEffects: remediationMessage({
    detected: "a Match.value(...).pipe(...) expression used as a standalone statement.",
    problem: "discarding the Match result indicates branch callbacks may execute side effects during render.",
    fix: "keep Match as a pure value expression and move effects into an event handler or an Effect runtime action outside rendering.",
    preserve: "branch selection, render purity, event timing, cleanup, and the selected value when it is still needed.",
  }),
};

function reactHookMessage(hookName) {
  return remediationMessage({
    detected: `${hookName} governed by the Effect Atom architecture rule.`,
    problem: "this project requires shared reactive state and effects to be owned by the Effect Atom runtime.",
    fix: "move this responsibility to an Atom or Effect operation and consume it through @effect/atom-react; do not substitute a different hook mechanically.",
    preserve: "component-local versus shared ownership, React lifecycle timing, cleanup, memoization, subscriptions, and render behavior.",
  });
}

const atomMethods = new Set(["get", "set", "update", "modify", "refresh"]);
const reactHooks = new Set([
  "useState",
  "useReducer",
  "useContext",
  "useCallback",
  "useEffect",
  "useSyncExternalStore",
]);
const collectionAtomName = /(CollectionAtom|ListAtom|Visible.*Atom|ResultsAtom|ReadStateAtom)/;

function isAtomOperation(node) {
  if (node?.type !== "CallExpression") return false;
  const method = memberName(node.callee);
  if (!method || !atomMethods.has(method)) return false;
  return identifierName(node.callee?.object) === "atomRegistry" || identifierName(node.callee?.object) === "Atom";
}

function isFamilyRead(node) {
  if (node?.type !== "CallExpression") return false;
  if (isIdentifier(node.callee, "get") || isCall(node, "Atom", "get")) return true;
  const callee = unwrapExpression(node.callee);
  return (
    callee?.type === "MemberExpression" &&
    memberName(callee) === "get" &&
    isIdentifier(callee.object, "get")
  );
}

function callbackReturnsSpreadObject(callback) {
  if (!isFunction(callback)) return false;
  const returned = unwrapExpression(returnedExpression(callback));
  return (
    returned?.type === "ObjectExpression" &&
    returned.properties.some((property) => property.type === "SpreadElement")
  );
}

function isEmptyObject(node) {
  const expression = unwrapExpression(node);
  return expression?.type === "ObjectExpression" && expression.properties.length === 0;
}

function isMatchValuePipeline(node) {
  return isPipeCall(node) && isCall(unwrapExpression(node.callee)?.object, "Match", "value");
}

export const webRules = {
  "no-atom-registry-effect-sync": defineEffectFileRule(
    messages.noAtomRegistryEffectSync,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (!enabled() || !isEffectCall(node, "sync")) return;
        collect(node.arguments[0], isAtomOperation).forEach((operation) => report(operation));
      },
    }),
  ),

  "no-family-collection-read": defineRule(
    messages.noFamilyCollectionRead,
    (context, report) => ({
      CallExpression(node) {
        if (!isFamilyRead(node) || !hasAncestor(node, (ancestor) => isCall(ancestor, "Atom", "family"))) {
          return;
        }
        const atom = node.arguments[0];
        if (atom && collectionAtomName.test(staticText(context.sourceCode, atom))) report(atom);
      },
    }),
  ),

  "no-naked-object-state-update": defineRule(
    messages.noNakedObjectStateUpdate,
    (_context, report) => ({
      CallExpression(node) {
        if (
          (isCall(node, "Ref", "update") || isCall(node, "Ref", "modify")) &&
          node.arguments.some(callbackReturnsSpreadObject)
        ) {
          report(node, messages.noRefSpreadUpdate);
          return;
        }
        if (
          isCall(node, "Object", "fromEntries") &&
          contains(node.arguments[0], (candidate) => isCall(candidate, "Object", "entries"))
        ) {
          report(node, messages.noEntriesRoundTrip);
          return;
        }
        if (
          isCall(node, "Object", "assign") &&
          node.arguments.length >= 3 &&
          isEmptyObject(node.arguments[0])
        ) {
          report(node, messages.noObjectAssignMerge);
          return;
        }
        if (isCall(node, "JSON", "stringify") || isCall(node, "JSON", "parse")) {
          report(node, messages.noJsonShortcut);
        }
      },
    }),
  ),

  "no-react-state": defineRule(messages.noReactState, (_context, report) => ({
    CallExpression(node) {
      const hookName = identifierName(node.callee) ?? memberName(node.callee);
      if (!hookName || !reactHooks.has(hookName)) return;
      const callee = unwrapExpression(node.callee);
      report(callee.type === "MemberExpression" ? callee.property : callee, reactHookMessage(hookName));
    },
  })),

  "no-render-side-effects": defineEffectFileRule(
    messages.noRenderSideEffects,
    (_context, report, enabled) => ({
      ExpressionStatement(node) {
        const expression = unwrapExpression(node.expression);
        if (!enabled() || !isMatchValuePipeline(expression)) return;
        if (
          contains(
            expression.arguments,
            (candidate) => isCall(candidate, "Match", "when") || isCall(candidate, "Match", "orElse"),
          )
        ) {
          report(expression);
        }
      },
    }),
  ),
};
