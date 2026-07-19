import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const presets = new Map([
  ["core", "core.jsonc"],
  ["full", "full.jsonc"],
  ["web", "web.jsonc"],
  ["ts-type", "ts-type.jsonc"],
]);

type ParsedArgs = {
  readonly each: boolean;
  readonly exceptRules: readonly string[];
  readonly preset: string;
  readonly rules: readonly string[];
  readonly targets: readonly string[];
};

const usage = `Usage:
  npx tsx scripts/profile-rules.ts [--preset full|core|web|ts-type] [--rule name] [--except name] [--each] <path...>

Output:
  rule<TAB>status<TAB>elapsed_ms`;

function parseArgs(argv: readonly string[]): ParsedArgs {
  const rules: string[] = [];
  const exceptRules: string[] = [];
  const targets: string[] = [];
  let each = false;
  let preset = "full";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage}\n`);
      process.exit(0);
    }

    if (arg === "--each") {
      each = true;
      continue;
    }

    if (arg === "--preset") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value after --preset.");
      }
      preset = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--preset=")) {
      preset = arg.slice("--preset=".length);
      continue;
    }

    if (arg === "--rule") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value after --rule.");
      }
      rules.push(value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--rule=")) {
      rules.push(arg.slice("--rule=".length));
      continue;
    }

    if (arg === "--except") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value after --except.");
      }
      exceptRules.push(value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--except=")) {
      exceptRules.push(arg.slice("--except=".length));
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    targets.push(arg);
  }

  if (!presets.has(preset)) {
    throw new Error(`Unknown preset: ${preset}`);
  }

  if (targets.length === 0) {
    throw new Error("Missing target path.");
  }

  return { each, exceptRules, preset, rules, targets };
}

function resolveOxlintBin(): string {
  const oxlintPackagePath = require.resolve("oxlint/package.json");
  const oxlintPackage = require(oxlintPackagePath);
  const oxlintBinRelative =
    typeof oxlintPackage.bin === "string" ? oxlintPackage.bin : oxlintPackage.bin.oxlint;

  return path.resolve(path.dirname(oxlintPackagePath), oxlintBinRelative);
}

function loadPresetRules(preset: string): ReadonlyArray<readonly [string, string]> {
  const configPath = path.join(repoRoot, "configs", presets.get(preset)!);
  const config = JSON.parse(readFileSync(configPath, "utf8")) as {
    rules?: Record<string, string>;
  };

  return Object.entries(config.rules ?? {});
}

function ruleName(configuredName: string): string {
  return configuredName.replace("effect/", "");
}

function runOxlint(
  label: string,
  configuredRules: ReadonlyArray<readonly [string, string]>,
  targets: readonly string[],
): void {
  const tempDir = mkdtempSync(path.join(tmpdir(), "oxc-effect-profile-"));
  const configPath = path.join(tempDir, ".oxlintrc.json");

  try {
    writeFileSync(
      configPath,
      `${JSON.stringify(
        {
          jsPlugins: [{ name: "effect", specifier: path.join(repoRoot, "plugin.js") }],
          rules: Object.fromEntries(configuredRules),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const startedAt = performance.now();
    const result = spawnSync(
      process.execPath,
      [
        resolveOxlintBin(),
        "-c",
        configPath,
        ...targets,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const elapsedMs = Math.round(performance.now() - startedAt);

    process.stdout.write(`${label}\t${result.status ?? 1}\t${elapsedMs}\n`);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const presetRules = loadPresetRules(args.preset);
  const selectedRules =
    args.rules.length === 0
      ? presetRules.filter(([name]) => !args.exceptRules.includes(ruleName(name)))
      : presetRules.filter(
          ([name]) =>
            args.rules.includes(ruleName(name)) &&
            !args.exceptRules.includes(ruleName(name)),
        );

  if (selectedRules.length === 0) {
    throw new Error("No matching rules selected.");
  }

  process.stdout.write("rule\tstatus\telapsed_ms\n");

  if (args.each) {
    for (const configuredRule of selectedRules) {
      runOxlint(ruleName(configuredRule[0]), [configuredRule], args.targets);
    }
    return;
  }

  runOxlint(
    args.rules.length === 0
      ? args.preset
      : selectedRules.map(([name]) => ruleName(name)).join(","),
    selectedRules,
    args.targets,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${usage}\n`);
  process.exit(1);
}
