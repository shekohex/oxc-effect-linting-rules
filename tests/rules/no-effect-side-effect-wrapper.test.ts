import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureRoot, lintWithRule } from "./ruleTestHarness";

const fixtures = fixtureRoot("no-effect-side-effect-wrapper");

describe("no-effect-side-effect-wrapper", () => {
  it("It catches direct Effect.as and Effect.andThen wrappers around obvious side effects", () => {
    const result = lintWithRule(
      "no-effect-side-effect-wrapper",
      path.join(fixtures, "invalid-direct-side-effect-wrapper.ts"),
    );

    expect(result.status).toBe(1);
    expect(result.output).toContain("Detected: Effect.as applied to an Effect containing");
    expect(result.output).toContain("Detected: data-first Effect.andThen whose first argument");
  });

  it("It allows named Effect sequencing without guessing side effects from variable names", () => {
    const result = lintWithRule(
      "no-effect-side-effect-wrapper",
      path.join(fixtures, "valid-named-effect-sequencing.ts"),
    );

    expect(result.status).toBe(0);
  });
});
