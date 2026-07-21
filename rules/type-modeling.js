import {
  contains,
  identifierName,
  isCall,
  isConstDeclaration,
  isFunction,
  isNullishLiteral,
  literalValue,
  propertyName,
  returnedExpression,
  staticText,
  unwrapExpression,
} from "../lib/ast.js";
import { defineEffectFileRule, defineRule, remediationMessage } from "./rule.js";

const messages = {
  noEffectTypeAlias: remediationMessage({
    detected: "a type alias containing Effect.Effect<Success, Error, Requirements>.",
    problem: "the alias hides the Effect channels from the service or operation that owns them.",
    fix: "prefer inference for local Effects, or place the explicit Effect type on the owning public service method or operation signature.",
    preserve: "success, error, and requirements channels plus the intended public API contract.",
  }),
  noOptionNullishRewrap: remediationMessage({
    detected: "an Option.fromNullishOr/fromNullOr/fromUndefinedOr argument with a matching ?? null or ?? undefined fallback.",
    problem: "the fallback repeats the constructor's absence handling and obscures the source's actual nullability.",
    fix: "pass the original source directly to the same Option constructor.",
    preserve: "whether null, undefined, or both represent absence and the resulting Option value type.",
  }),
  noManualDataGuard: remediationMessage({
    detected: "a user-defined type predicate that narrows an unknown or any parameter without decoding it.",
    problem: "the predicate can claim trusted domain data without validating its runtime structure.",
    fix: "decode with the canonical Schema first, then use typed Match patterns or ordinary predicates on the decoded value.",
    preserve: "validation errors, nominal instanceof checks, narrowing behavior, and the trusted domain type.",
  }),
  noModelOverlayCast: remediationMessage({
    detected: "a non-const TypeScript as assertion on a const initializer in an Effect ecosystem file.",
    problem: "the assertion can hide schema drift or add fields the decoder did not validate.",
    fix: "decode with the schema that produces the required model type, then read or construct fields through typed model APIs.",
    preserve: "runtime validation, branded or nominal identity, readonly fields, and the exact model type.",
  }),
  noOptionBooleanNormalization: remediationMessage({
    detected: "Option.match mapping some with value === true and none with false.",
    problem: "boolean coercion is repeated in service flow instead of being defined once at input decoding.",
    fix: "normalize optional boolean input in the owning Schema and consume the decoded boolean directly.",
    preserve: "the distinction between false, absent, invalid, and truthy non-boolean input.",
  }),
  noUnknownBooleanCoercionHelper: remediationMessage({
    detected: "a typeof value === boolean check in an Effect file that also contains null-fallback matching.",
    problem: "local coercion can assign inconsistent meanings to false, null, undefined, and invalid input.",
    fix: "decode boolean optionality once in the owning Schema and consume the resulting typed value in service flow.",
    preserve: "false versus absence, invalid-input errors, defaults, and external payload compatibility.",
  }),
};

function qualifiedTypeName(node) {
  if (node?.type !== "TSQualifiedName") return undefined;
  const left = identifierName(node.left);
  const right = identifierName(node.right);
  return left && right ? `${left}.${right}` : undefined;
}

function isEffectTypeReference(node) {
  return node?.type === "TSTypeReference" && qualifiedTypeName(node.typeName) === "Effect.Effect";
}

function unwrapParameter(parameter) {
  let current = parameter;
  if (current?.type === "TSParameterProperty") current = current.parameter;
  if (current?.type === "AssignmentPattern") current = current.left;
  return current;
}

function hasUnknownOrAnyType(parameter) {
  const unwrapped = unwrapParameter(parameter);
  return contains(
    unwrapped?.typeAnnotation,
    (node) => node.type === "TSUnknownKeyword" || node.type === "TSAnyKeyword",
  );
}

function typePredicate(functionNode) {
  const annotation = functionNode.returnType?.typeAnnotation ?? functionNode.returnType;
  return annotation?.type === "TSTypePredicate" ? annotation : undefined;
}

function isInstanceofExpression(node) {
  return node?.type === "BinaryExpression" && node.operator === "instanceof";
}

function isConstAssertion(typeNode, sourceCode) {
  return typeNode?.type === "TSConstKeyword" || staticText(sourceCode, typeNode) === "const";
}

function objectProperty(objectExpression, name) {
  return objectExpression?.type === "ObjectExpression"
    ? objectExpression.properties.find(
        (property) => property.type === "Property" && propertyName(property) === name,
      )
    : undefined;
}

function isTrueComparison(node) {
  const expression = unwrapExpression(node);
  return (
    expression?.type === "BinaryExpression" &&
    ["===", "=="].includes(expression.operator) &&
    literalValue(expression.right) === true
  );
}

function isNullMatchFallback(node) {
  return (
    isCall(node, "Match", "orElse") &&
    node.arguments.some(
      (argument) => isFunction(argument) && literalValue(returnedExpression(argument)) === null,
    )
  );
}

export const typeModelingRules = {
  "no-effect-type-alias": defineEffectFileRule(
    messages.noEffectTypeAlias,
    (_context, report, enabled) => ({
      TSTypeAliasDeclaration(node) {
        if (!enabled()) return;
        const effectType = contains(node.typeAnnotation, isEffectTypeReference)
          ? node.typeAnnotation
          : undefined;
        if (effectType) report(effectType);
      },
    }),
  ),

  "no-option-nullish-rewrap": defineEffectFileRule(
    messages.noOptionNullishRewrap,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (!enabled()) return;
        const constructorName = ["fromNullishOr", "fromNullOr", "fromUndefinedOr"].find(
          (name) => isCall(node, "Option", name),
        );
        if (!constructorName) return;
        const argument = unwrapExpression(node.arguments[0]);
        if (argument?.type !== "LogicalExpression" || argument.operator !== "??") return;

        const fallback = unwrapExpression(argument.right);
        const redundantFallback =
          constructorName === "fromNullishOr"
            ? isNullishLiteral(fallback)
            : constructorName === "fromNullOr"
              ? literalValue(fallback) === null
              : fallback?.type === "Identifier" && fallback.name === "undefined";
        if (redundantFallback) report(node);
      },
    }),
  ),

  "no-manual-data-guard": defineRule(messages.noManualDataGuard, (_context, report) => {
    const inspectFunction = (node) => {
      const predicate = typePredicate(node);
      if (!predicate || contains(node.body, isInstanceofExpression)) return;
      const predicateParameter = identifierName(predicate.parameterName);
      if (!predicateParameter) return;
      const unsafeParameter = node.params.some((parameter) => {
        const unwrapped = unwrapParameter(parameter);
        return identifierName(unwrapped) === predicateParameter && hasUnknownOrAnyType(unwrapped);
      });
      if (unsafeParameter) report(predicate);
    };

    return {
      ArrowFunctionExpression: inspectFunction,
      FunctionExpression: inspectFunction,
      FunctionDeclaration: inspectFunction,
    };
  }),

  "no-model-overlay-cast": defineEffectFileRule(
    messages.noModelOverlayCast,
    (context, report, enabled) => ({
      VariableDeclaration(node) {
        if (!enabled() || !isConstDeclaration(node)) return;
        const hasUnsafeCast = node.declarations.some((declarator) => {
          const initializer = declarator.init;
          return (
            initializer?.type === "TSAsExpression" &&
            !isConstAssertion(initializer.typeAnnotation, context.sourceCode)
          );
        });
        if (hasUnsafeCast) report(node);
      },
    }),
  ),

  "no-option-boolean-normalization": defineEffectFileRule(
    messages.noOptionBooleanNormalization,
    (_context, report, enabled) => ({
      CallExpression(node) {
        if (!enabled() || !isCall(node, "Option", "match")) return;
        const cases = unwrapExpression(node.arguments[1]);
        const onSome = objectProperty(cases, "onSome");
        const onNone = objectProperty(cases, "onNone");
        if (
          isFunction(onSome?.value) &&
          isTrueComparison(returnedExpression(onSome.value)) &&
          isFunction(onNone?.value) &&
          literalValue(returnedExpression(onNone.value)) === false
        ) {
          report(node);
        }
      },
    }),
  ),

  "no-unknown-boolean-coercion-helper": defineEffectFileRule(
    messages.noUnknownBooleanCoercionHelper,
    (context, report, enabled) => ({
      BinaryExpression(node) {
        if (!enabled() || !["===", "=="].includes(node.operator)) return;
        const left = unwrapExpression(node.left);
        if (
          left?.type !== "UnaryExpression" ||
          left.operator !== "typeof" ||
          literalValue(node.right) !== "boolean"
        ) {
          return;
        }
        if (contains(context.sourceCode.ast, isNullMatchFallback)) report(node);
      },
    }),
  ),
};
