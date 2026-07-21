import { describe, expect, it } from "vitest";
import { lintSourceWithRule } from "./ruleTestHarness";

const effectImport = 'import "effect";\n';

describe("canonical Effect guidelines", () => {
  it("It catches generator callback aliases passed to named Effect.fn", () => {
    const result = lintSourceWithRule(
      "no-effect-fn-callback-alias",
      `${effectImport}
const loadUserGen = function* (id: string) { return id; };
const loadUser = Effect.fn("loadUser")(loadUserGen);`,
    );

    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "Detected: Effect.fn receiving its operation callback through an identifier.",
    );
  });

  it("It catches function declarations passed to uncurried Effect.fn", () => {
    const result = lintSourceWithRule(
      "no-effect-fn-callback-alias",
      `${effectImport}
function* loadUserGen(id: string) { return id; }
const loadUser = Effect.fn(loadUserGen);`,
    );

    expect(result.output).toContain(
      "Detected: Effect.fn receiving its operation callback through an identifier.",
    );
  });

  it("It allows inline generator callbacks in Effect.fn", () => {
    const result = lintSourceWithRule(
      "no-effect-fn-callback-alias",
      `${effectImport}const loadUser = Effect.fn("loadUser")(function* (id: string) { return id; });`,
    );

    expect(result.status).toBe(0);
  });

  it("It catches extracted generator callbacks passed to Effect.gen", () => {
    const result = lintSourceWithRule(
      "no-effect-gen-callback-alias",
      `${effectImport}
function* transactionOperation() { return 1; }
const transaction = Effect.gen(transactionOperation);`,
    );

    expect(result.output).toContain(
      "Detected: Effect.gen receiving its generator callback through an identifier.",
    );
  });

  it("It allows inline generator callbacks in Effect.gen", () => {
    const result = lintSourceWithRule(
      "no-effect-gen-callback-alias",
      `${effectImport}const transaction = Effect.gen(function* () { return 1; });`,
    );

    expect(result.status).toBe(0);
  });

  it("It catches reusable functions that only return Effect.gen", () => {
    const result = lintSourceWithRule(
      "prefer-effect-fn",
      `${effectImport}const loadUser = (id: string) => Effect.gen(function* () { return id; });`,
    );

    expect(result.output).toContain(
      "Detected: a reusable function whose body only returns Effect.gen.",
    );
  });

  it("It allows complete Effect values", () => {
    const result = lintSourceWithRule(
      "prefer-effect-fn",
      `${effectImport}const program = Effect.gen(function* () { return 1; });`,
    );

    expect(result.status).toBe(0);
  });

  it("It catches Effect.fnUntraced application operations", () => {
    const result = lintSourceWithRule(
      "no-effect-fn-untraced",
      `${effectImport}const loadUser = Effect.fnUntraced(function* () { return 1; });`,
    );

    expect(result.output).toContain("Detected: Effect.fnUntraced used in application code.");
  });

  it("It allows return statements in inline generator callbacks", () => {
    const result = lintSourceWithRule(
      "no-return-in-callback",
      `${effectImport}const loadUser = Effect.fn("loadUser")(function* () { return 1; });`,
    );

    expect(result.output).not.toContain(
      "Detected: a return statement inside an inline function-expression callback.",
    );
  });

  it("It allows if guard clauses in Effect generators", () => {
    const result = lintSourceWithRule(
      "require-return-yield-effect-terminal",
      `${effectImport}
const loadUser = Effect.fn("loadUser")(function* (valid: boolean) {
  if (!valid) return yield* Effect.fail("invalid");
  return "valid";
});`,
    );

    expect(result.status).toBe(0);
  });

  it("It catches terminal failures without return yield", () => {
    const result = lintSourceWithRule(
      "require-return-yield-effect-terminal",
      `${effectImport}
const loadUser = Effect.fn("loadUser")(function* (valid: boolean) {
  if (!valid) yield* Effect.fail("invalid");
  return "valid";
});`,
    );

    expect(result.output).toContain(
      "Detected: yield* Effect.fail or yield* Effect.interrupt used as a standalone generator statement.",
    );
  });

  it("It catches direct native current-time reads", () => {
    const result = lintSourceWithRule(
      "no-native-current-time",
      `${effectImport}const first = Date.now(); const second = new Date();`,
    );

    expect(result.output.match(/Detected: Date\.now\(\) or a zero-argument new Date\(\)/g)).toHaveLength(2);
  });

  it("It allows native Date conversion from explicit values", () => {
    const result = lintSourceWithRule(
      "no-native-current-time",
      `${effectImport}const epoch = new Date(0); const parsed = new Date(input);`,
    );

    expect(result.status).toBe(0);
  });

  it("It allows transaction-local inline Effect.gen inside Effect.fn", () => {
    const result = lintSourceWithRule(
      "no-effect-gen-callback-alias",
      `${effectImport}
const save = Effect.fn("save")(function* () {
  return yield* sql.withTransaction(Effect.gen(function* () { return 1; }));
});`,
    );

    expect(result.status).toBe(0);
  });

  it("It catches live Effect sleeps in tests", () => {
    const result = lintSourceWithRule(
      "no-effect-sleep-in-test",
      `${effectImport}const wait = Effect.sleep("250 millis");`,
      undefined,
      "workflow.test.ts",
    );

    expect(result.output).toContain("Detected: Effect.sleep using live time in a test file.");
  });

  it("It allows Effect sleeps in production workflows", () => {
    const result = lintSourceWithRule(
      "no-effect-sleep-in-test",
      `${effectImport}const wait = Effect.sleep("250 millis");`,
      undefined,
      "worker.ts",
    );

    expect(result.status).toBe(0);
  });

  it("It allows Effect sleeps in deliberate live tests", () => {
    const result = lintSourceWithRule(
      "no-effect-sleep-in-test",
      `${effectImport}it.live("uses live time", () => Effect.gen(function* () { yield* Effect.sleep(1); }));`,
      undefined,
      "workflow.test.ts",
    );

    expect(result.status).toBe(0);
  });

  it("It catches throws inside Effect generators", () => {
    const result = lintSourceWithRule(
      "no-throw-in-effect-generator",
      `${effectImport}const program = Effect.gen(function* () { throw new Error("boom"); });`,
    );

    expect(result.output).toContain("Detected: a throw statement inside an Effect generator.");
  });

  it("It allows throws inside Effect.try boundaries", () => {
    const result = lintSourceWithRule(
      "no-throw-in-effect-generator",
      `${effectImport}const program = Effect.try({ try: () => { throw new Error("boom"); }, catch: identity });`,
    );

    expect(result.output).not.toContain("Detected: a throw statement inside an Effect generator.");
  });

  it("It catches ambient JavaScript capabilities in Effect files", () => {
    const cases = [
      ["prefer-effect-async", "const value = new Promise(resolve => resolve(1));"],
      ["prefer-effect-config", "const value = process.env.API_URL;"],
      ["prefer-effect-file-system", 'import { readFile } from "node:fs/promises";'],
      ["prefer-effect-http-client", 'const value = globalThis.fetch("https://example.com");'],
      ["prefer-effect-scheduling", "const value = globalThis.setInterval(run, 1000);"],
      ["prefer-effect-date-time", "const value = Date.parse(input);"],
      ["prefer-effect-random", "const value = Math.random();"],
      ["prefer-schema-json", "const value = JSON.parse(input);"],
    ] as const;

    for (const [ruleName, source] of cases) {
      const result = lintSourceWithRule(ruleName, `${effectImport}${source}`);
      expect(result.output).toContain("Detected:");
    }
  });

  it("It allows matching Effect capabilities", () => {
    const cases = [
      ["prefer-effect-async", "const value = Effect.async(register);"],
      ["prefer-effect-config", 'const value = Config.string("API_URL");'],
      ["prefer-effect-file-system", "const value = yieldFileSystem;"],
      ["prefer-effect-http-client", 'const value = client.get("https://example.com");'],
      ["prefer-effect-scheduling", 'const value = Effect.sleep("1 second");'],
      ["prefer-effect-date-time", "const value = DateTime.make(input);"],
      ["prefer-effect-random", "const value = Random.next;"],
      ["prefer-schema-json", "const value = Schema.decodeUnknownEffect(JsonSchema)(input);"],
    ] as const;

    for (const [ruleName, source] of cases) {
      const result = lintSourceWithRule(ruleName, `${effectImport}${source}`);
      expect(result.output).not.toContain("Detected:");
    }
  });

  it("It catches manual Effect test runtimes and provisioning", () => {
    const runtime = lintSourceWithRule(
      "no-effect-run-in-test",
      `${effectImport}it("works", async () => Effect.runPromise(program));`,
      undefined,
      "workflow.test.ts",
    );
    const layer = lintSourceWithRule(
      "prefer-effect-test-layer",
      `${effectImport}it.effect("works", () => program.pipe(Effect.provide(TestLayer)));`,
      undefined,
      "workflow.test.ts",
    );

    expect(runtime.output).toContain("Detected: an Effect.runPromise");
    expect(layer.output).toContain("Detected: Effect.provide used directly inside a test file.");
  });

  it("It allows @effect/vitest Effect tests with layer helpers", () => {
    const result = lintSourceWithRule(
      "prefer-effect-vitest",
      `${effectImport}import { assert, it, layer } from "@effect/vitest";`,
      undefined,
      "workflow.test.ts",
    );

    expect(result.status).toBe(0);
  });

  it("It catches sync Schema parsing inside Effect generators", () => {
    const result = lintSourceWithRule(
      "no-schema-sync-in-effect-generator",
      `${effectImport}const program = Effect.gen(function* () { return Schema.decodeUnknownSync(User)(input); });`,
    );

    expect(result.output).toContain(
      "Detected: a synchronous throwing Schema decoder or encoder inside an Effect generator.",
    );
  });

  it("It allows sync Schema parsing in pure tests", () => {
    const result = lintSourceWithRule(
      "no-schema-sync-in-effect-generator",
      `${effectImport}const user = Schema.decodeUnknownSync(User)(input);`,
      undefined,
      "schema.test.ts",
    );

    expect(result.status).toBe(0);
  });
});
