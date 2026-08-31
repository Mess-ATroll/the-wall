"use client";

import { formatTimeAgo } from "@/lib/formatTime";
import type { Brick, ReactionKey } from "@/lib/types";
import ReactionBar from "./ReactionBar";
import BrickMenu from "./BrickMenu";

interface BrickCardProps {
  brick: Brick;
  onReact: (id: string, key: ReactionKey) => void;
  onShare: (brick: Brick) => void;
  onCopyLink: (brick: Brick) => void;
  onReport: (brick: Brick) => void;
}

export default function BrickCard({ brick, onReact, onShare, onCopyLink, onReport }: BrickCardProps) {
  return (
    <article className="animate-fade-in rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="mortar-edge -mx-4 -mt-4 mb-4 sm:-mx-5 sm:-mt-5" aria-hidden="true" />

      <div className="mb-3 flex items-center justify-between">
        <span className="font-stamp text-[11px] uppercase tracking-wider text-accent">
          {brick.category}
        </span>
        <time className="font-stamp text-[11px] text-text-faint">
          {formatTimeAgo(brick.createdAt)}
        </time>
      </div>

      <p className="mb-4 whitespace-pre-wrap text-base leading-relaxed text-text sm:text-[17px]">
        {brick.text}
      </p>

      <div className="flex items-center justify-between gap-2">
        <ReactionBar
          reactions={brick.reactions}
          userReaction={brick.userReaction}
          onReact={(key) => onReact(brick.id, key)}
        />
        <BrickMenu
          onShare={() => onShare(brick)}
          onCopyLink={() => onCopyLink(brick)}
          onReport={() => onReport(brick)}
        />
      </div>
    </article>
  );
}
