import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureRoot, lintWithRule } from "./ruleTestHarness";

const fixtures = fixtureRoot("no-manual-data-guard");
const ruleName = "no-manual-data-guard";
const diagnostic =
  "Detected: a user-defined type predicate that narrows an unknown or any parameter without decoding it.";

describe(ruleName, () => {
  it("It catches structural manual data guards", () => {
    const result = lintWithRule(
      ruleName,
      path.join(fixtures, "invalid-structural-guards.ts"),
    );

    expect(result.status).toBe(1);
    expect(result.output).toContain(diagnostic);
    expect(result.output.match(/Detected: a user-defined type predicate/g)).toHaveLength(2);
  });

  it("It catches primitive refinement of unknown data", () => {
    const result = lintWithRule(
      ruleName,
      path.join(fixtures, "invalid-primitive-refinement.ts"),
    );

    expect(result.status).toBe(1);
    expect(result.output).toContain(diagnostic);
    expect(result.output.match(/Detected: a user-defined type predicate/g)).toHaveLength(1);
  });

  it("It allows Schema decoding and Match discrimination", () => {
    const result = lintWithRule(
      ruleName,
      path.join(fixtures, "valid-schema-and-match.ts"),
    );

    expect(result.status).toBe(0);
  });

  it("It allows typed narrowing and nominal identity checks", () => {
    const result = lintWithRule(
      ruleName,
      path.join(fixtures, "valid-type-predicates.ts"),
    );

    expect(result.status).toBe(0);
  });
});
