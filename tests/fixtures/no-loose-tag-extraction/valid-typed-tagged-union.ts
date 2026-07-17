type Failure =
  | { readonly _tag: "NotFound"; readonly id: string }
  | { readonly _tag: "Unavailable"; readonly retryAfter: number };

const failureTag = (failure: Failure) => failure._tag;

const hasNumericTag = (
  value: unknown,
): value is { readonly _tag: number; readonly message: string } =>
  typeof value === "object" &&
  value !== null &&
  "_tag" in value &&
  typeof value._tag === "number" &&
  "message" in value &&
  typeof value.message === "string";

const describeFailure = (failure: Failure) => {
  switch (failure._tag) {
    case "NotFound":
      return `Missing ${failure.id}`;
    case "Unavailable":
      return `Retry after ${failure.retryAfter}`;
  }
};

export { describeFailure, failureTag, hasNumericTag };
