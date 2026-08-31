"use client";

import { useEffect, useRef, useState } from "react";

interface BrickMenuProps {
  onShare: () => void;
  onCopyLink: () => void;
  onReport: () => void;
}

export default function BrickMenu({ onShare, onCopyLink, onReport }: BrickMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function handleSelect(action: () => void) {
    action();
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More options"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text"
      >
        <span aria-hidden="true" className="text-base leading-none">
          •••
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-40 animate-fade-in overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg shadow-black/40"
        >
          <MenuItem role="menuitem" onClick={() => handleSelect(onShare)}>
            Share
          </MenuItem>
          <MenuItem role="menuitem" onClick={() => handleSelect(onCopyLink)}>
            Copy link
          </MenuItem>
          <MenuItem role="menuitem" onClick={() => handleSelect(onReport)} danger>
            Report
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  role: "menuitem";
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`block w-full px-3.5 py-2 text-left text-sm transition-colors duration-150 hover:bg-surface-hover ${
        danger ? "text-danger" : "text-text"
      }`}
    >
      {children}
    </button>
  );
}
