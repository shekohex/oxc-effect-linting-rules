import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export const fixtureRoot = (fixtureName: string) =>
  path.join(repoRoot, "tests", "fixtures", fixtureName);

function resolveOxlintBin() {
  const oxlintPackagePath = require.resolve("oxlint/package.json");
  const oxlintPackage = require(oxlintPackagePath);
  const oxlintBinRelative =
    typeof oxlintPackage.bin === "string" ? oxlintPackage.bin : oxlintPackage.bin.oxlint;
  return path.resolve(path.dirname(oxlintPackagePath), oxlintBinRelative);
}

const warningRules = new Set([
  "no-effect-succeed-variable",
  "no-flatmap-ladder",
  "no-option-effect-branch",
  "prefer-assert-in-effect-test",
  "prefer-effect-async",
  "prefer-effect-cache",
  "prefer-effect-child-process",
  "prefer-effect-date-time",
  "prefer-effect-http-client",
  "prefer-effect-scheduling",
  "prefer-effect-test-layer",
  "prefer-schema-json",
  "no-return-in-arrow",
  "no-return-in-callback",
  "warn-effect-sync-wrapper",
]);

type RuleSeverity = "off" | "warn" | "error";
type RuleConfiguration = RuleSeverity | readonly [RuleSeverity, Record<string, unknown>];

export function lintWithRule(
  ruleName: string,
  fixtureFile: string,
  ruleConfiguration?: RuleConfiguration,
) {
  return lintFilesWithRule(ruleName, [fixtureFile], ruleConfiguration);
}

export function lintFilesWithRule(
  ruleName: string,
  fixtureFiles: readonly string[],
  ruleConfiguration?: RuleConfiguration,
) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "oxc-effect-rule-test-"));
  const configPath = path.join(tempDir, ".oxlintrc.json");
  const pluginPath = path.join(repoRoot, "plugin.js");

  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        jsPlugins: [{ name: "effect", specifier: pluginPath }],
        rules: {
          [`effect/${ruleName}`]:
            ruleConfiguration ?? (warningRules.has(ruleName) ? "warn" : "error"),
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  try {
    const result = spawnSync(
      process.execPath,
      [
        resolveOxlintBin(),
        "-c",
        configPath,
        ...fixtureFiles,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    return {
      status: result.status ?? 1,
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    };
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

export function lintSourceWithRule(
  ruleName: string,
  source: string,
  ruleConfiguration?: RuleConfiguration,
  fixtureName = "fixture.tsx",
) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "oxc-effect-source-test-"));
  const fixtureFile = path.join(tempDir, fixtureName);
  writeFileSync(fixtureFile, source, "utf8");

  try {
    return lintWithRule(ruleName, fixtureFile, ruleConfiguration);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}
