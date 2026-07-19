import { Context, Effect, Match, Option, Result } from "effect";
import { Atom } from "effect/unstable/reactivity";

declare const sourceAtom: Atom.Atom<number>;

const callback = Effect.callback<void>((resume) => resume(Effect.void));
const recovered = Effect.catch(Effect.fail("failure"), () => Effect.succeed(1));
const sequenced = Effect.succeed(1).pipe(Effect.andThen(Effect.succeed(2)));
const option = Option.fromNullishOr<number | null>(null);
const result = Result.match(Result.succeed(1), {
  onFailure: () => 0,
  onSuccess: (value) => value,
});
const matched = Match.value("ready" as const).pipe(
  Match.when("ready", () => true),
  Match.orElse(() => false),
);
const atomValue = Atom.get(sourceAtom);
const fiber = Effect.runFork(Effect.succeed(1));
const contextualFiber = Effect.runForkWith(Context.empty())(Effect.succeed(1));

export {
  atomValue,
  callback,
  contextualFiber,
  fiber,
  matched,
  option,
  recovered,
  result,
  sequenced,
};
