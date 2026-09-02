"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface BrickMenuProps {
  onShare: () => void;
  onCopyLink: () => void;
  onReport: () => void;
}

const MENU_WIDTH = 160;
const MENU_MARGIN = 8;

export default function BrickMenu({ onShare, onCopyLink, onReport }: BrickMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [mounted] = useState(() => typeof document !== "undefined");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Position is computed in viewport coordinates (not document
    // coordinates) since the menu is rendered as position: fixed in a
    // portal — it deliberately does NOT live inside any brick card's
    // (transformed, and therefore stacking-context-isolated) DOM
    // subtree, which is what let neighboring cards visually cover it.
    let left = rect.right - MENU_WIDTH;
    left = Math.max(MENU_MARGIN, Math.min(left, window.innerWidth - MENU_WIDTH - MENU_MARGIN));
    const top = rect.bottom + 4;

    setPosition({ top, left });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    // Closing on scroll/resize is the simplest correct way to avoid a
    // stale-positioned menu floating away from its trigger — reopening
    // is one tap away, and this is a common, acceptable pattern for
    // exactly this kind of transient menu.
    function handleScrollOrResize() {
      setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open]);

  function handleSelect(action: () => void) {
    action();
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More options"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text"
      >
        <span aria-hidden="true" className="text-base leading-none">
          •••
        </span>
      </button>

      {open &&
        position &&
        mounted &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
            className="fixed z-50 animate-fade-in overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg shadow-black/40"
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
          </div>,
          document.body
        )}
    </>
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
