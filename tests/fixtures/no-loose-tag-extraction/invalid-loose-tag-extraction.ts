const hasLooseTag = (
  value: unknown,
): value is { readonly _tag: string } =>
  typeof value === "object" &&
  value !== null &&
  "_tag" in value &&
  typeof value._tag === "string";

const extractFailureTag = (failure: unknown) =>
  hasLooseTag(failure) ? failure._tag : "UnknownFailure";

function isLooseTaggedFailure(value: unknown): value is { _tag: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "_tag" in value &&
    typeof value._tag === "string"
  );
}

export { extractFailureTag, isLooseTaggedFailure };
