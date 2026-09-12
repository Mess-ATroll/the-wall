"use client";

interface HeroProps {
  onLeaveBrick: () => void;
  onWalkTheWall: () => void;
  onCreateWall: () => void;
}

export default function Hero({
  onLeaveBrick,
  onWalkTheWall,
  onCreateWall,
}: HeroProps) {
  return (
    <section
      id="top"
      tabIndex={-1}
      className="mx-auto flex max-w-[760px] flex-col items-center gap-4 px-4 pb-8 pt-10 text-center outline-none sm:pb-10 sm:pt-14"
    >
      <h1 className="font-display text-4xl font-bold tracking-wide text-text sm:text-5xl">
        THE WALL
      </h1>
      <p className="text-lg text-text sm:text-xl">The internet has opinions.</p>
      <p className="max-w-sm text-sm text-text-muted">
        Anonymous thoughts, opinions, jokes and everything in between.
      </p>

      <div className="mt-3 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onLeaveBrick}
          className="rounded-full bg-accent px-6 py-3 text-sm font-bold tracking-wide text-accent-text transition-transform duration-150 hover:brightness-110 active:scale-95"
        >
          Leave a Brick
        </button>

        <button
          type="button"
          onClick={onWalkTheWall}
          className="font-stamp text-xs tracking-wider text-text-muted transition-colors duration-150 hover:text-text"
        >
          EXPLORE THE WALL ↓
        </button>

        <button
          type="button"
          onClick={onCreateWall}
          className="text-xs text-text-faint underline-offset-4 transition-colors duration-150 hover:text-text-muted hover:underline"
        >
          Borrow the Wall for your group
        </button>
      </div>
    </section>
  );
}
