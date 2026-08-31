"use client";

interface HeaderProps {
  onLeaveBrick: () => void;
}

export default function Header({ onLeaveBrick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[760px] items-center justify-between px-4">
        <a
          href="#top"
          className="flex items-center gap-2 font-display text-[17px] font-bold tracking-wide text-text"
        >
          <span aria-hidden="true">🧱</span>
          <span>THE WALL</span>
        </a>

        <button
          type="button"
          onClick={onLeaveBrick}
          className="rounded-full bg-accent px-4 py-2 text-xs font-bold tracking-wide text-accent-text transition-transform duration-150 hover:brightness-110 active:scale-95"
        >
          Leave a Brick
        </button>
      </div>
    </header>
  );
}
