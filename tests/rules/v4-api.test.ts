import { describe, expect, it } from "vitest";
import { lintSourceWithRule } from "./ruleTestHarness";

const effectImport = 'import "effect";\n';

describe("Effect v4 API compatibility", () => {
  it("It catches Effect.callback constructors", () => {
    const result = lintSourceWithRule(
      "no-effect-callback",
      `${effectImport}const value = Effect.callback((resume) => resume(Effect.void));`,
    );

    expect(result.output).toContain("Detected: a low-level Effect.callback integration.");
  });

  it("It catches Effect.catch around direct and piped sequencing chains", () => {
    const result = lintSourceWithRule(
      "no-effect-catch-ladder",
      `${effectImport}
const direct = Effect.catch(Effect.flatMap(source, next), recover);
const piped = source.pipe(Effect.flatMap(next), Effect.catch(recover));`,
    );

    expect(result.output.match(/Detected: Effect\.catch wrapped around a multi-step sequencing chain\./g)).toHaveLength(2);
  });

  it("It allows Effect.catch around an unstaged source", () => {
    const result = lintSourceWithRule(
      "no-effect-catch-ladder",
      `${effectImport}const value = Effect.catch(source, recover);`,
    );

    expect(result.output).not.toContain("Detected: Effect.catch wrapped around a multi-step sequencing chain.");
  });

  it("It catches Effect.runFork and Effect.runForkWith", () => {
    const result = lintSourceWithRule(
      "no-effect-runfork",
      `${effectImport}
const first = Effect.runFork(program);
const second = Effect.runForkWith(services)(program);`,
    );

    expect(result.output.match(/Detected: Effect\.runFork or Effect\.runForkWith/g)).toHaveLength(2);
  });

  it("It allows Effect.forkScoped", () => {
    const result = lintSourceWithRule(
      "no-effect-runfork",
      `${effectImport}const fiber = program.pipe(Effect.forkScoped);`,
    );

    expect(result.output).not.toContain("Detected: Effect.runFork or Effect.runForkWith");
  });

  it("It catches redundant v4 Option nullish constructor fallbacks", () => {
    const result = lintSourceWithRule(
      "no-option-nullish-rewrap",
      `${effectImport}
const nullish = Option.fromNullishOr(input ?? null);
const nullable = Option.fromNullOr(input ?? null);
const optional = Option.fromUndefinedOr(input ?? undefined);`,
    );

    expect(result.output.match(/Detected: an Option\.fromNullishOr\/fromNullOr\/fromUndefinedOr argument/g)).toHaveLength(3);
  });

  it("It allows v4 Option fallbacks that change null semantics", () => {
    const result = lintSourceWithRule(
      "no-option-nullish-rewrap",
      `${effectImport}
const keepUndefined = Option.fromNullOr(input ?? undefined);
const keepNull = Option.fromUndefinedOr(input ?? null);`,
    );

    expect(result.output).not.toContain("Detected: an Option.fromNullishOr/fromNullOr/fromUndefinedOr argument");
  });
});
