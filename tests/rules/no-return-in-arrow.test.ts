import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureRoot, lintWithRule } from "./ruleTestHarness";

const fixtures = fixtureRoot("no-return-in-arrow");
const diagnostic = "Detected: a return statement inside a block-bodied arrow callback.";

describe("no-return-in-arrow", () => {
  it("It catches block-bodied arrow callbacks with returns", () => {
    const result = lintWithRule(
      "no-return-in-arrow",
      path.join(fixtures, "invalid-callback-return.ts"),
    );

    expect(result.status).toBe(0);
    expect(result.output).toContain(diagnostic);
  });

  it("It allows Schema.filter predicate returns", () => {
    const result = lintWithRule(
      "no-return-in-arrow",
      path.join(fixtures, "valid-schema-filter-return.ts"),
    );

    expect(result.status).toBe(0);
    expect(result.output).not.toContain(diagnostic);
  });
});
