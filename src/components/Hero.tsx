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
      className="wall-texture mx-auto flex max-w-[760px] flex-col items-center gap-4 px-4 pb-8 pt-10 text-center sm:pb-10 sm:pt-14"
    >
      <h1 className="font-display text-4xl font-bold tracking-wide text-text sm:text-5xl">
        THE WALL
      </h1>
      <p className="text-lg text-text sm:text-xl">
        &ldquo;Say something. Leave no name.&rdquo;
      </p>
      <p className="max-w-sm text-sm text-text-muted">
        Anonymous thoughts, one Brick at a time.
      </p>

      <div className="mt-3 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onLeaveBrick}
          className="rounded-full bg-accent px-6 py-3 text-sm font-bold tracking-wide text-accent-text transition-transform duration-150 hover:brightness-110 active:scale-95"
        >
          LEAVE A BRICK
        </button>

        <button
          type="button"
          onClick={onCreateWall}
          className="rounded-full border border-border px-6 py-3 text-sm font-bold tracking-wide text-text transition-colors duration-150 hover:bg-surface-hover active:scale-95"
        >
          CREATE A WALL
        </button>

        <button
          type="button"
          onClick={onWalkTheWall}
          className="font-stamp text-xs tracking-wider text-text-muted transition-colors duration-150 hover:text-text"
        >
          WALK THE WALL ↓
        </button>
      </div>
    </section>
  );
}
