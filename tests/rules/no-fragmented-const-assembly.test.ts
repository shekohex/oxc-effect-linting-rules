import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureRoot, lintWithRule } from "./ruleTestHarness";

const fixtures = fixtureRoot("defragmentation");
const ruleName = "no-fragmented-const-assembly";
const diagnosticMessage = "Detected: an object literal spreading the result of a function call.";

describe(ruleName, () => {
  it("It catches direct const fragments used inside const function object assembly", () => {
    const result = lintWithRule(
      ruleName,
      path.join(fixtures, "invalid-direct-const-fragment.ts"),
    );
    expect(result.status).toBe(1);
    expect(result.output).toContain(diagnosticMessage);
  });

  it("It catches second-level const assembly chains", () => {
    const result = lintWithRule(ruleName, path.join(fixtures, "invalid-assembly-chain.ts"));
    expect(result.status).toBe(1);
    expect(result.output).toContain(diagnosticMessage);
  });

  it("It catches helper fragments spread into constructor payloads", () => {
    const result = lintWithRule(
      ruleName,
      path.join(fixtures, "invalid-constructor-fragment.ts"),
    );
    expect(result.status).toBe(1);
    expect(result.output).toContain(diagnosticMessage);
  });

  it("It allows Data tagged enum declarations and explicit final object contracts", () => {
    const result = lintWithRule(ruleName, path.join(fixtures, "valid-const-assembly.ts"));
    expect(result.status).toBe(0);
  });

  it("It allows React presentation tables, hook key derivation, and local JSX render helpers", () => {
    const result = lintWithRule(
      ruleName,
      path.join(fixtures, "valid-react-presentation-composition.tsx"),
    );
    expect(result.status).toBe(0);
  });

  it("It allows atom projection helpers and stable service error adapters", () => {
    const result = lintWithRule(
      ruleName,
      path.join(fixtures, "valid-atom-projection-and-error-adapters.ts"),
    );
    expect(result.status).toBe(0);
  });
});
