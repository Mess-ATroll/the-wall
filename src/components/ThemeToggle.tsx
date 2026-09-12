"use client";

import { useEffect, useState } from "react";
import { getCurrentTheme, setTheme, type Theme } from "@/lib/theme";

export default function ThemeToggle() {
  // Starts as null so the icon doesn't render (and mismatch) before the
  // inline theme script's attribute has been read on mount.
  const [theme, setThemeState] = useState<Theme | null>(null);

  useEffect(() => {
    // Reads the attribute the pre-hydration inline script (see layout.tsx)
    // already set on <html> — this is syncing from an external system
    // (the DOM), not deriving state we could compute during render, since
    // the static-exported HTML has no way to know the theme at build time.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(getCurrentTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  if (!theme) {
    return <div className="h-8 w-8" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text active:scale-90"
    >
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
