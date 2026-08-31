import type { ReactionKey } from "./types";

const STORAGE_KEY = "wall_my_reactions_v1";

function readStore(): Record<string, ReactionKey> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ReactionKey>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, ReactionKey>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // storage unavailable (private browsing, quota, etc.) — degrade silently
  }
}

export function getStoredReaction(brickId: string): ReactionKey | null {
  return readStore()[brickId] ?? null;
}

export function setStoredReaction(brickId: string, reaction: ReactionKey | null) {
  const store = readStore();
  if (reaction) {
    store[brickId] = reaction;
  } else {
    delete store[brickId];
  }
  writeStore(store);
}

export function getStoredReactionsFor(brickIds: string[]): Record<string, ReactionKey> {
  const store = readStore();
  const result: Record<string, ReactionKey> = {};
  for (const id of brickIds) {
    if (store[id]) result[id] = store[id];
  }
  return result;
}
