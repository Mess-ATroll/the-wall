"use client";

import { CATEGORIES, type CategoryFilter } from "@/lib/types";

const FILTERS: CategoryFilter[] = ["All", ...CATEGORIES];

interface CategoryNavProps {
  active: CategoryFilter;
  onChange: (category: CategoryFilter) => void;
}

export default function CategoryNav({ active, onChange }: CategoryNavProps) {
  return (
    <nav
      aria-label="Filter bricks by category"
      className="sticky top-14 z-20 border-b border-border bg-bg/85 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-[760px] gap-2 overflow-x-auto px-4 py-2.5 no-scrollbar">
        {FILTERS.map((category) => {
          const isActive = category === active;
          return (
            <button
              key={category}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(category)}
              className={`shrink-0 rounded-full border px-3.5 py-2 font-stamp text-[11px] uppercase tracking-wider transition-colors duration-150 ${
                isActive
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-text-muted hover:border-text-faint hover:text-text"
              }`}
            >
              {category}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
