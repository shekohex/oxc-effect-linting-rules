const ignoredTraversalKeys = new Set(["parent", "tokens", "comments"]);

export function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string" && visit(node) === false) return;

  for (const [key, value] of Object.entries(node)) {
    if (ignoredTraversalKeys.has(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit);
    } else if (value && typeof value === "object") {
      walk(value, visit);
    }
  }
}

export function findDescendant(node, predicate) {
  let found;
  walk(node, (candidate) => {
    if (candidate !== node && predicate(candidate)) {
      found = candidate;
      return false;
    }
  });
  return found;
}

export function contains(node, predicate) {
  let found = false;
  walk(node, (candidate) => {
    if (predicate(candidate)) {
      found = true;
      return false;
    }
  });
  return found;
}

export function collect(node, predicate) {
  const matches = [];
  walk(node, (candidate) => {
    if (predicate(candidate)) matches.push(candidate);
  });
  return matches;
}

export function unwrapExpression(node) {
  let current = node;
  while (
    current &&
    [
      "ChainExpression",
      "TSAsExpression",
      "TSSatisfiesExpression",
      "TSNonNullExpression",
      "TSTypeAssertion",
    ].includes(current.type)
  ) {
    current = current.expression;
  }
  return current;
}

export function identifierName(node) {
  const expression = unwrapExpression(node);
  return expression?.type === "Identifier" ? expression.name : undefined;
}

export function memberName(node) {
  const expression = unwrapExpression(node);
  if (expression?.type !== "MemberExpression") return undefined;
  if (!expression.computed && expression.property.type === "Identifier") {
    return expression.property.name;
  }
  if (expression.computed && expression.property.type === "Literal") {
    return typeof expression.property.value === "string"
      ? expression.property.value
      : undefined;
  }
  return undefined;
}

export function isIdentifier(node, name) {
  return identifierName(node) === name;
}

export function isMember(node, objectName, propertyName) {
  const expression = unwrapExpression(node);
  return (
    expression?.type === "MemberExpression" &&
    identifierName(expression.object) === objectName &&
    memberName(expression) === propertyName
  );
}

export function isMemberStartingWith(node, objectName, propertyPrefix) {
  const expression = unwrapExpression(node);
  return (
    expression?.type === "MemberExpression" &&
    identifierName(expression.object) === objectName &&
    memberName(expression)?.startsWith(propertyPrefix) === true
  );
}

export function isCall(node, objectName, propertyName) {
  const expression = unwrapExpression(node);
  if (expression?.type !== "CallExpression") return false;
  if (propertyName === undefined) return isIdentifier(expression.callee, objectName);
  return isMember(expression.callee, objectName, propertyName);
}

export function isEffectCall(node, methodName) {
  const expression = unwrapExpression(node);
  if (expression?.type !== "CallExpression") return false;
  if (!isMember(expression.callee, "Effect", memberName(expression.callee))) return false;
  return methodName === undefined || memberName(expression.callee) === methodName;
}

export function isPipeCall(node) {
  const expression = unwrapExpression(node);
  if (expression?.type !== "CallExpression") return false;
  return isIdentifier(expression.callee, "pipe") || memberName(expression.callee) === "pipe";
}

export function isFunction(node) {
  return [
    "ArrowFunctionExpression",
    "FunctionExpression",
    "FunctionDeclaration",
  ].includes(node?.type);
}

export function returnedExpression(functionNode) {
  if (!isFunction(functionNode)) return undefined;
  if (functionNode.body.type !== "BlockStatement") return functionNode.body;
  const returnStatement = functionNode.body.body.find(
    (statement) => statement.type === "ReturnStatement",
  );
  return returnStatement?.argument;
}

export function literalValue(node) {
  const expression = unwrapExpression(node);
  return expression?.type === "Literal" ? expression.value : undefined;
}

export function propertyName(node) {
  if (!node || !["Property", "PropertyDefinition"].includes(node.type)) return undefined;
  if (!node.computed && node.key.type === "Identifier") return node.key.name;
  if (node.key.type === "Literal") return node.key.value;
  return undefined;
}

export function hasEffectEcosystemReference(program) {
  return contains(
    program,
    (node) =>
      node.type === "Literal" &&
      typeof node.value === "string" &&
      (node.value === "effect" ||
        node.value.startsWith("effect/") ||
        node.value === "@effect/atom-react"),
  );
}

export function isConstDeclaration(node) {
  return node?.type === "VariableDeclaration" && node.kind === "const";
}

export function variableIdentifier(declarator) {
  return declarator?.id?.type === "Identifier" ? declarator.id.name : undefined;
}

export function isNullishLiteral(node) {
  const expression = unwrapExpression(node);
  return (
    (expression?.type === "Literal" && expression.value === null) ||
    (expression?.type === "Identifier" && expression.name === "undefined")
  );
}

export function hasAncestor(node, predicate) {
  let current = node?.parent;
  while (current) {
    if (predicate(current)) return true;
    current = current.parent;
  }
  return false;
}

export function staticText(sourceCode, node) {
  return node ? sourceCode.getText(node) : "";
}
