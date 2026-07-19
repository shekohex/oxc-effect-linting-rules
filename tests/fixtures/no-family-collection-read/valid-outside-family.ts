import { Atom } from "effect/unstable/reactivity";

export const eventHistoryCollectionAtom = Atom.make((get) => ({
  rows: [],
  keys: [],
  nextToken: null,
}));

export const eventHistoryCountAtom = Atom.make((get) => {
  const collection = get(eventHistoryCollectionAtom);
  return collection.rows.length;
});
