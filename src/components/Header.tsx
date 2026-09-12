"use client";

import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

interface HeaderProps {
  /** Omit to hide the CTA entirely (e.g. on a private Wall, where "Leave a
   * Brick" means something different and is handled by that page itself). */
  onLeaveBrick?: () => void;
  /** Omit to hide the Borrow a Wall nav item (e.g. while already inside one). */
  onBorrowWall?: () => void;
  /** Where the wordmark links. "#top" scrolls within the page (homepage);
   * a real path like "/" is used on routes that don't have a #top anchor. */
  homeHref?: string;
}

export default function Header({ onLeaveBrick, onBorrowWall, homeHref = "#top" }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md transition-colors duration-200">
      <div className="mx-auto flex h-14 max-w-[760px] items-center justify-between gap-3 px-4">
        <Link
          href={homeHref}
          className="shrink-0 rounded-md font-display text-[17px] font-bold tracking-wide text-text transition-colors duration-150 hover:text-text-muted"
        >
          THE WALL
        </Link>

        <nav aria-label="Primary" className="flex min-w-0 items-center gap-1 sm:gap-2">
          {onBorrowWall && (
            <button
              type="button"
              onClick={onBorrowWall}
              className="shrink-0 rounded-full px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text active:scale-95 sm:text-sm"
            >
              <span className="sm:hidden">Borrow</span>
              <span className="hidden sm:inline">Borrow a Wall</span>
            </button>
          )}

          <ThemeToggle />

          {onLeaveBrick && (
            <button
              type="button"
              onClick={onLeaveBrick}
              className="hidden shrink-0 rounded-full bg-accent px-4 py-2 text-xs font-bold tracking-wide text-accent-text transition-transform duration-150 hover:brightness-110 active:scale-95 sm:inline-flex"
            >
              Leave a Brick
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
