"use client";

import { REACTIONS, type ReactionCounts, type ReactionKey } from "@/lib/types";

interface ReactionBarProps {
  reactions: ReactionCounts;
  userReaction: ReactionKey | null;
  onReact: (key: ReactionKey) => void;
}

export default function ReactionBar({ reactions, userReaction, onReact }: ReactionBarProps) {
  return (
    <div className="flex flex-wrap gap-1 sm:gap-1.5" role="group" aria-label="React to this brick">
      {REACTIONS.map(({ key, emoji, label }) => {
        const isActive = userReaction === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isActive}
            aria-label={`${label}, ${reactions[key]} reactions`}
            title={label}
            onClick={() => onReact(key)}
            className={`flex items-center gap-1 rounded-full border px-2 py-1.5 text-[11px] transition-all duration-150 active:scale-90 sm:gap-1.5 sm:px-2.5 sm:text-xs ${
              isActive
                ? "border-accent bg-accent-soft text-accent"
                : "border-border text-text-muted hover:border-text-faint hover:text-text"
            }`}
          >
            <span aria-hidden="true">{emoji}</span>
            <span className="font-stamp tabular-nums">{reactions[key]}</span>
          </button>
        );
      })}
    </div>
  );
}
