"use client";

interface EmptyStateProps {
  onLeaveBrick: () => void;
}

export default function EmptyState({ onLeaveBrick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <p className="text-text">Nothing on this wall yet.</p>
      <p className="text-sm text-text-muted">Be the first to leave a brick.</p>
      <button
        type="button"
        onClick={onLeaveBrick}
        className="mt-1 rounded-full bg-accent px-5 py-2.5 text-xs font-bold tracking-wide text-accent-text transition-transform duration-150 hover:brightness-110 active:scale-95"
      >
        LEAVE A BRICK
      </button>
    </div>
  );
}
