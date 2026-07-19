import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import plugin from "../../plugin.js";
import { lintSourceWithRule, repoRoot } from "./ruleTestHarness";

describe("published plugin configuration", () => {
  it("It allows every exported rule to be enabled by full preset", () => {
    const config = JSON.parse(
      readFileSync(path.join(repoRoot, "configs", "full.jsonc"), "utf8"),
    ) as { rules: Record<string, string> };
    const configuredRules = Object.keys(config.rules)
      .map((name) => name.replace("effect/", ""))
      .sort();

    expect(configuredRules).toEqual(Object.keys(plugin.rules).sort());
  });

  it("It allows every rule to expose complete agent remediation guidance", () => {
    for (const rule of Object.values(plugin.rules)) {
      expect(rule.meta.docs.description).toMatch(
        /^Detected: .+ Problem: .+ Fix: .+ Preserve: .+$/,
      );
    }
  });

  it("It allows rules to be disabled with Oxlint severity", () => {
    const result = lintSourceWithRule(
      "no-switch-statement",
      'import "effect"; switch (value) { case "ready": run(); }',
      "off",
    );

    expect(result.output).not.toContain("Detected: a switch statement in an Effect ecosystem file.");
  });

  it("It allows rules to ignore configured path fragments", () => {
    const result = lintSourceWithRule(
      "no-switch-statement",
      'import "effect"; switch (value) { case "ready": run(); }',
      ["error", { ignoredPathFragments: ["fixture.tsx"] }],
    );

    expect(result.output).not.toContain("Detected: a switch statement in an Effect ecosystem file.");
  });
});
