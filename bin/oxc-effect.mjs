#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const presetFiles = {
  core: "core.jsonc",
  web: "web.jsonc",
  "ts-type": "ts-type.jsonc",
  full: "full.jsonc",
};

const helpText = `oxc-effect CLI

Usage:
  npx @shekohex/oxc-effect check <path...> [--preset=<name>] [--guide|--guide-on-linting]
  npx @shekohex/oxc-effect guide [--print]

Commands:
  check        Run Oxlint with shipped Effect rules.
  guide        Print the packaged linting guide path or file content.

Options:
  --preset=<name>   One of: full, core, web, ts-type. Default: full
  --guide           Print linting guide content before lint (check command only).
  --guide-on-linting  Print linting guide content only when lint emits diagnostics (check command only).
  --print           With 'guide', print file content instead of path.
  --help            Print this help text.
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printHelp() {
  process.stdout.write(`${helpText}\n`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { help: true };
  }

  if (command !== "check" && command !== "guide") {
    fail(`Unknown command "${command}". Use "check" or "guide".`);
  }

  const parsed = {
    command,
    preset: "full",
    targets: [],
    printGuide: false,
    showGuide: "off",
  };

  // Parse only the CLI contract here.
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }

    if (command === "guide" && arg === "--print") {
      parsed.printGuide = true;
      continue;
    }

    if (command === "check" && arg === "--guide") {
      parsed.showGuide = "always";
      continue;
    }

    if (command === "check" && arg === "--guide-on-linting") {
      parsed.showGuide = "on-error";
      continue;
    }

    if (arg === "--preset") {
      if (command !== "check") {
        fail("--preset is only supported with the 'check' command.");
      }
      const value = rest[index + 1];
      if (!value) {
        fail("Missing value after --preset.");
      }
      parsed.preset = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--preset=")) {
      if (command !== "check") {
        fail("--preset is only supported with the 'check' command.");
      }
      parsed.preset = arg.slice("--preset=".length);
      continue;
    }

    if (arg.startsWith("-")) {
      if (command === "guide") {
        fail(`Unknown option "${arg}". Only --print and --help are supported with 'guide'.`);
      }
      fail(
        `Unknown option "${arg}". Only --preset, --guide, --guide-on-linting, and --help are supported with 'check'.`,
      );
    }

    parsed.targets.push(arg);
  }

  if (parsed.command === "guide") {
    if (parsed.targets.length > 0) {
      fail("The 'guide' command does not accept positional targets.");
    }
    return parsed;
  }

  if (!(parsed.preset in presetFiles)) {
    fail(
      `Unknown preset "${parsed.preset}". Use one of: ${Object.keys(presetFiles).join(", ")}.`,
    );
  }

  if (parsed.targets.length === 0) {
    fail("Missing target path. Pass one or more files or directories.");
  }

  return parsed;
}

async function loadPresetConfig(presetName) {
  const presetPath = path.join(packageRoot, "configs", presetFiles[presetName]);
  const presetConfig = JSON.parse(await readFile(presetPath, "utf8"));

  return {
    ...presetConfig,
    jsPlugins: [
      {
        name: "effect",
        specifier: path.join(packageRoot, "plugin.js"),
      },
    ],
  };
}

function resolveOxlintBin() {
  const oxlintPackagePath = require.resolve("oxlint/package.json");
  const oxlintPackage = require(oxlintPackagePath);
  const oxlintBinRelative =
    typeof oxlintPackage.bin === "string" ? oxlintPackage.bin : oxlintPackage.bin.oxlint;

  return path.resolve(path.dirname(oxlintPackagePath), oxlintBinRelative);
}

function resolveLintingGuidePath() {
  return path.join(packageRoot, "docs", "linting.md");
}

async function printLintingGuideContent() {
  const guidePath = resolveLintingGuidePath();
  const guide = await readFile(guidePath, "utf8");
  process.stdout.write(`${guide}\n`);
}

async function run() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) {
    printHelp();
    return;
  }

  if (parsed.command === "guide") {
    const guidePath = resolveLintingGuidePath();
    if (parsed.printGuide) {
      process.stdout.write(await readFile(guidePath, "utf8"));
      return;
    }
    process.stdout.write(`${guidePath}\n`);
    return;
  }

  const config = await loadPresetConfig(parsed.preset);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "oxc-effect-"));
  const configPath = path.join(tempDir, ".oxlintrc.json");
  const oxlintBin = resolveOxlintBin();
  const oxlintCommand = ["-c", configPath];

  oxlintCommand.push(...parsed.targets);

  try {
    if (parsed.showGuide === "always") {
      await printLintingGuideContent();
    }

    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [oxlintBin, ...oxlintCommand], {
        cwd: process.cwd(),
        stdio: "inherit",
      });

      child.on("error", reject);
      child.on("exit", (code, signal) => {
        if (signal) {
          reject(new Error(`Oxlint exited with signal ${signal}.`));
          return;
        }

        resolve(code ?? 1);
      });
    });

    if (parsed.showGuide === "on-error" && exitCode !== 0) {
      await printLintingGuideContent();
    }

    process.exit(exitCode);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

run().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
