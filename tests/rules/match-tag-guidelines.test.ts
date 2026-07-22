import { describe, expect, it } from "vitest";
import { lintSourceWithRule } from "./ruleTestHarness";

const effectImport = 'import { Match } from "effect";\n';

describe("tagged value matching", () => {
  it("It catches Match.when branches that manually match a direct _tag pattern", () => {
    const result = lintSourceWithRule(
      "prefer-match-tags",
      `${effectImport}
const delta = Match.value(event).pipe(
  Match.when({ _tag: "CashIssuedToDriver" }, (value) => value.amount),
  Match.when({ _tag: "CustomerRefundPaid" }, (value) => -value.amount),
  Match.exhaustive,
);`,
    );

    expect(result.output).toContain(
      "Detected: Match.when manually matching a tagged value through a direct _tag object pattern.",
    );
  });

  it("It allows Match.tagsExhaustive tagged value mappings", () => {
    const result = lintSourceWithRule(
      "prefer-match-tags",
      `${effectImport}
const delta = Match.value(event).pipe(
  Match.tagsExhaustive({
    CashIssuedToDriver: (value) => value.amount,
    CustomerRefundPaid: (value) => -value.amount,
  }),
);`,
    );

    expect(result.status).toBe(0);
  });

  it("It allows nested _tag patterns that compare composite values", () => {
    const result = lintSourceWithRule(
      "prefer-match-tags",
      `${effectImport}
const equal = Match.value({ left, right }).pipe(
  Match.when(
    { left: { _tag: "PayAtPickup" }, right: { _tag: "PayAtPickup" } },
    () => true,
  ),
  Match.orElse(() => false),
);`,
    );

    expect(result.status).toBe(0);
  });

  it("It allows direct _tag patterns with additional structural constraints", () => {
    const result = lintSourceWithRule(
      "prefer-match-tags",
      `${effectImport}
const amount = Match.value(event).pipe(
  Match.when({ _tag: "CustomerCollectionReceived", currency: "EGP" }, handler),
  Match.orElse(fallback),
);`,
    );

    expect(result.status).toBe(0);
  });

  it("It catches Match.value called with a tagged value's _tag property", () => {
    const result = lintSourceWithRule(
      "prefer-match-value-tags",
      `${effectImport}
const mode = Match.value(settlement._tag).pipe(
  Match.when("PayAtPickup", () => "cash"),
  Match.when("DeliveryFeeOnly", () => "fee"),
  Match.exhaustive,
);`,
    );

    expect(result.output).toContain(
      "Detected: Match.value called with a tagged value's _tag property instead of the tagged value.",
    );
  });

  it("It allows _tag reads outside Match.value representation matching", () => {
    const result = lintSourceWithRule(
      "prefer-match-value-tags",
      `${effectImport}const persistedEventType = event._tag;`,
    );

    expect(result.status).toBe(0);
  });

  it("It catches neutral fallbacks after multiple tagged domain branches", () => {
    const result = lintSourceWithRule(
      "no-match-tag-neutral-fallback",
      `${effectImport}
const delta = Match.value(event).pipe(
  Match.when({ _tag: "CashIssuedToDriver" }, (value) => value.amount),
  Match.when({ _tag: "CustomerRefundPaid" }, (value) => -value.amount),
  Match.orElse(() => 0),
);`,
    );

    expect(result.output).toContain(
      "Detected: multiple tagged domain branches followed by a neutral Match.orElse fallback.",
    );
  });

  it("It allows neutral fallback for focused single-tag extraction", () => {
    const result = lintSourceWithRule(
      "no-match-tag-neutral-fallback",
      `${effectImport}
const targetIds = Match.value(event).pipe(
  Match.when({ _tag: "CashEventVoided" }, (value) => [value.targetEventId]),
  Match.orElse(() => []),
);`,
    );

    expect(result.status).toBe(0);
  });

  it("It allows meaningful fallback calculations after tagged branches", () => {
    const result = lintSourceWithRule(
      "no-match-tag-neutral-fallback",
      `${effectImport}
const amount = Match.value(event).pipe(
  Match.when({ _tag: "CustomerCollectionReceived" }, (value) => value.amount),
  Match.when({ _tag: "CustomerRefundPaid" }, (value) => -value.amount),
  Match.orElse((unhandled) => estimateAmount(unhandled)),
);`,
    );

    expect(result.status).toBe(0);
  });
});
