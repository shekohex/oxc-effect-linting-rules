import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureRoot, lintSourceWithRule, lintWithRule } from "./ruleTestHarness";

const fixtures = fixtureRoot("no-effect-wrapper-alias");

describe("no-effect-wrapper-alias", () => {
  it("It catches local Effect wrapper aliases", () => {
    const result = lintWithRule(
      "no-effect-wrapper-alias",
      path.join(fixtures, "invalid-effect-wrapper-alias.ts"),
    );

    expect(result.status).toBe(1);
    expect(result.output).toContain("Detected: a local declaration that only aliases an Effect pipeline");
  });

  it("It allows plain domain functions", () => {
    const result = lintWithRule(
      "no-effect-wrapper-alias",
      path.join(fixtures, "valid-domain-function.ts"),
    );

    expect(result.status).toBe(0);
  });

  it("It allows plain staged Effect values owned by the staging rule", () => {
    const result = lintSourceWithRule(
      "no-effect-wrapper-alias",
      "const value = Effect.succeed(input);",
    );

    expect(result.output).not.toContain("Detected: a local declaration that only aliases an Effect pipeline");
  });
});
