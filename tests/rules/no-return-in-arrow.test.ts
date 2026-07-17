import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureRoot, lintWithRule } from "./ruleTestHarness";

const fixtures = fixtureRoot("no-return-in-arrow");
const diagnostic =
  "Rule: review block-bodied arrow callbacks before rewriting them. Inspect the callback's role in the surrounding data or Effect flow, including its data, state, and collection choices. Check whether an Effect-native construct expresses the work more clearly. Do not compress the callback into one line or extract a wrapper only to clear this advisory. Keep the block when it is the clearest form.";

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
