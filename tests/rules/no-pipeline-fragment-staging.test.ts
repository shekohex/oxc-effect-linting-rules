import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureRoot, lintWithRule } from "./ruleTestHarness";

const fixtures = fixtureRoot("defragmentation");
const ruleName = "no-pipeline-fragment-staging";
const diagnosticMessage =
  "Detected: a local pipe result stored in a const and later consumed by another returned pipe in the same block.";

describe(ruleName, () => {
  it("It catches local pipeline fragments consumed by returned pipelines", () => {
    const result = lintWithRule(
      ruleName,
      path.join(fixtures, "invalid-pipeline-fragment-return.ts"),
    );
    expect(result.status).toBe(1);
    expect(result.output).toContain(diagnosticMessage);
  });

  it("It allows final domain values before continuous returned pipelines", () => {
    const result = lintWithRule(
      ruleName,
      path.join(fixtures, "valid-pipeline-final-domain-value.ts"),
    );
    expect(result.status).toBe(0);
  });

  it("It allows nested render callback composition inside result matching", () => {
    const result = lintWithRule(
      ruleName,
      path.join(fixtures, "valid-nested-render-callback-composition.tsx"),
    );
    expect(result.status).toBe(0);
  });
});
