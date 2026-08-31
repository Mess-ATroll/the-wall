"use client";

import { useEffect, useState } from "react";
import { REPORT_REASONS, type ReportReason } from "@/lib/types";

interface ReportModalProps {
  onClose: () => void;
  onSubmit: (reason: ReportReason) => Promise<void>;
}

export default function ReportModal({ onClose, onSubmit }: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
    if (!reason) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(reason);
      setSubmitted(true);
    } catch {
      setError("Couldn't send the report. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

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
        aria-labelledby="report-title"
        className="animate-slide-up w-full max-w-[420px] rounded-t-3xl border border-border bg-surface p-5 sm:rounded-3xl sm:p-6"
      >
        {submitted ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <p className="text-text">Thanks. We&rsquo;ll take a look.</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border px-5 py-2 text-sm text-text transition-colors duration-150 hover:bg-surface-hover"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 id="report-title" className="font-display text-lg font-bold text-text">
                REPORT BRICK
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
              <fieldset>
                <legend className="mb-3 text-sm text-text-muted">
                  What&rsquo;s wrong with this brick?
                </legend>
                <div className="flex flex-col gap-2">
                  {REPORT_REASONS.map((r) => (
                    <label
                      key={r}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors duration-150 ${
                        reason === r
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-border text-text hover:border-text-faint"
                      }`}
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        value={r}
                        checked={reason === r}
                        onChange={() => setReason(r)}
                        className="accent-[var(--wall-accent)]"
                      />
                      {r}
                    </label>
                  ))}
                </div>
              </fieldset>

              <button
                type="submit"
                disabled={!reason || submitting}
                className="mt-5 w-full rounded-full bg-danger py-3 text-sm font-bold tracking-wide text-white transition-transform duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "SENDING…" : "REPORT"}
              </button>
              {error && (
                <p role="alert" className="mt-2 text-center text-xs text-danger">
                  {error}
                </p>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
