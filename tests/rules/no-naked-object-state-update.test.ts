import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureRoot, lintWithRule } from "./ruleTestHarness";

const fixtures = fixtureRoot("no-naked-object-state-update");
const ruleName = "no-naked-object-state-update";

describe("no-naked-object-state-update", () => {
  it("It catches spread-based Ref.update patching", () => {
    const result = lintWithRule(ruleName, path.join(fixtures, "invalid-spread.ts"));
    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "Detected: Ref.update or Ref.modify returning an object built with spread syntax.",
    );
  });

  it("It catches Object.fromEntries/Object.entries rebuild pipelines", () => {
    const result = lintWithRule(ruleName, path.join(fixtures, "invalid-from-entries.ts"));
    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "Detected: Object.fromEntries applied to data produced from Object.entries.",
    );
  });

  it("It allows Object.fromEntries context index rebuilding outside Ref transitions", () => {
    const result = lintWithRule(
      ruleName,
      path.join(fixtures, "valid-operation-index-from-context.ts"),
    );
    expect(result.status).toBe(0);
  });

  it("It catches Object.assign patch style in state transitions", () => {
    const result = lintWithRule(ruleName, path.join(fixtures, "invalid-object-assign.ts"));
    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "Detected: Object.assign({}, ...) used to merge three or more objects.",
    );
  });

  it("It allows declarative EffectRecord + schema reconstruction", () => {
    const result = lintWithRule(ruleName, path.join(fixtures, "valid-effect-record-set.ts"));
    expect(result.status).toBe(0);
  });
});
