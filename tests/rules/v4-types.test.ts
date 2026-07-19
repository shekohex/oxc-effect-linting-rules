import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./ruleTestHarness";

const require = createRequire(import.meta.url);

describe("Effect v4 type compatibility", () => {
  it("It allows representative Effect v4 APIs to typecheck", () => {
    const typescriptPackagePath = require.resolve("typescript/package.json");
    const typescriptBin = path.resolve(
      path.dirname(typescriptPackagePath),
      "bin",
      "tsc",
    );
    const fixture = path.join(
      repoRoot,
      "tests",
      "fixtures",
      "v4-api",
      "valid-effect-v4-api.ts",
    );
    const result = spawnSync(
      process.execPath,
      [
        typescriptBin,
        "--noEmit",
        "--skipLibCheck",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        "--target",
        "ES2022",
        fixture,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    expect(`${result.stdout}${result.stderr}`).toBe("");
    expect(result.status).toBe(0);
  });
});
