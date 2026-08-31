"use client";

interface ToastProps {
  message: string;
}

export default function Toast({ message }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-toast-in fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-text shadow-lg shadow-black/40 sm:bottom-8"
    >
      {message}
    </div>
  );
}
