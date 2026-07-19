import { hasEffectEcosystemReference } from "../lib/ast.js";

export function remediationMessage({ detected, problem, fix, preserve }) {
  return `Detected: ${detected} Problem: ${problem} Fix: ${fix} Preserve: ${preserve}`;
}

function ruleMeta(message) {
  return {
    type: "problem",
    docs: { description: message },
    schema: [
      {
        type: "object",
        properties: {
          ignoredPathFragments: {
            type: "array",
            items: { type: "string", minLength: 1 },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
  };
}

function isIgnored(context) {
  const ignoredPathFragments = context.options[0]?.ignoredPathFragments ?? [];
  const filename = context.filename ?? "";
  return ignoredPathFragments.some((fragment) => filename.includes(fragment));
}

export function defineRule(message, buildVisitors) {
  return {
    meta: ruleMeta(message),
    createOnce(context) {
      const report = (node, overrideMessage = message) =>
        !isIgnored(context) && context.report({ node, message: overrideMessage });
      return buildVisitors(context, report);
    },
  };
}

export function defineEffectFileRule(message, buildVisitors) {
  return {
    meta: ruleMeta(message),
    createOnce(context) {
      let effectFile = false;
      const report = (node, overrideMessage = message) =>
        !isIgnored(context) && context.report({ node, message: overrideMessage });

      return {
        before() {
          effectFile = false;
        },
        Program(node) {
          effectFile = hasEffectEcosystemReference(node);
        },
        ...buildVisitors(context, report, () => effectFile),
      };
    },
  };
}
