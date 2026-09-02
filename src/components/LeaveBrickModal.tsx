"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type Category } from "@/lib/types";

const MAX_LENGTH = 280;

interface LeaveBrickModalProps {
  onClose: () => void;
  onSubmit: (text: string, category: Category) => Promise<void>;
  defaultCategory: Category;
  cooldownSeconds: number;
}

export default function LeaveBrickModal({
  onClose,
  onSubmit,
  defaultCategory,
  cooldownSeconds,
}: LeaveBrickModalProps) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (cooldownSeconds > 0) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Your brick can't be empty.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(trimmed, category);
      // success: the parent closes the modal
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setSubmitting(false);
    }
  }

  const remaining = MAX_LENGTH - text.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-brick-title"
        className="animate-slide-up flex max-h-[85dvh] w-full max-w-[520px] flex-col overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 sm:rounded-3xl sm:p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="leave-brick-title" className="font-display text-xl font-bold text-text">
            LEAVE A BRICK
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="brick-text" className="mb-2 block text-sm text-text-muted">
            What&rsquo;s on your mind?
          </label>
          <textarea
            id="brick-text"
            ref={textareaRef}
            value={text}
            maxLength={MAX_LENGTH}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            rows={4}
            placeholder="Say something..."
            aria-describedby="brick-char-count"
            disabled={submitting}
            className="w-full resize-none rounded-xl border border-border bg-bg px-3.5 py-3 text-base text-text placeholder:text-text-faint focus:border-accent disabled:opacity-60"
          />

          <div className="mt-1.5 flex items-center justify-between">
            <span
              id="brick-char-count"
              className={`font-stamp text-xs tabular-nums ${
                remaining < 20 ? "text-danger" : "text-text-faint"
              }`}
            >
              {text.length} / {MAX_LENGTH}
            </span>
            {error && (
              <span role="alert" className="text-xs text-danger">
                {error}
              </span>
            )}
          </div>

          <fieldset className="mt-4">
            <legend className="mb-2 text-sm text-text-muted">Category</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const isActive = c === category;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setCategory(c)}
                    className={`rounded-full border px-3 py-1.5 font-stamp text-[11px] uppercase tracking-wider transition-colors duration-150 ${
                      isActive
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border text-text-muted hover:border-text-faint hover:text-text"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={submitting || cooldownSeconds > 0}
            className="mt-5 w-full rounded-full bg-accent py-3 text-sm font-bold tracking-wide text-accent-text transition-transform duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? "POSTING…"
              : cooldownSeconds > 0
                ? `WAIT ${cooldownSeconds}S`
                : "LEAVE IT"}
          </button>

          <p className="mt-3 text-center text-xs text-text-faint">
            {cooldownSeconds > 0
              ? `You can post again in ${cooldownSeconds}s.`
              : "No name. No account. Just a thought."}
          </p>
        </form>
      </div>
    </div>
  );
}
