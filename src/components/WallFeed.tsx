"use client";

import type { Brick, ReactionKey, SortMode } from "@/lib/types";
import BrickCard from "./BrickCard";
import EmptyState from "./EmptyState";

interface WallFeedProps {
  bricks: Brick[];
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  onReact: (id: string, key: ReactionKey) => void;
  onShare: (brick: Brick) => void;
  onCopyLink: (brick: Brick) => void;
  onReport: (brick: Brick) => void;
  onLeaveBrick: () => void;
}

export default function WallFeed({
  bricks,
  sortMode,
  onSortChange,
  onReact,
  onShare,
  onCopyLink,
  onReport,
  onLeaveBrick,
}: WallFeedProps) {
  return (
    <section aria-label="The wall" className="mx-auto max-w-[760px] px-4 pb-32 sm:pb-16">
      <div className="mb-4 flex items-center gap-1 pt-1">
        <SortTab
          label="FRESH"
          isActive={sortMode === "fresh"}
          onClick={() => onSortChange("fresh")}
        />
        <span className="text-text-faint" aria-hidden="true">
          |
        </span>
        <SortTab
          label="TRENDING"
          isActive={sortMode === "trending"}
          onClick={() => onSortChange("trending")}
        />
      </div>

      {bricks.length === 0 ? (
        <EmptyState onLeaveBrick={onLeaveBrick} />
      ) : (
        <div className="flex flex-col gap-3">
          {bricks.map((brick) => (
            <BrickCard
              key={brick.id}
              brick={brick}
              onReact={onReact}
              onShare={onShare}
              onCopyLink={onCopyLink}
              onReport={onReport}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SortTab({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
      className={`rounded-full px-3 py-2 font-stamp text-xs tracking-wider transition-colors duration-150 ${
        isActive ? "text-accent" : "text-text-faint hover:text-text-muted"
      }`}
    >
      {label}
    </button>
  );
}
