"use client";

interface MobileLeaveBrickBarProps {
  onLeaveBrick: () => void;
}

export default function MobileLeaveBrickBar({ onLeaveBrick }: MobileLeaveBrickBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md sm:hidden">
      <button
        type="button"
        onClick={onLeaveBrick}
        className="w-full rounded-full bg-accent py-3 text-sm font-bold tracking-wide text-accent-text transition-transform duration-150 active:scale-[0.98]"
      >
        LEAVE A BRICK
      </button>
    </div>
  );
}
