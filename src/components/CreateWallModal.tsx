"use client";

import { FormEvent, useState } from "react";

interface CreateWallModalProps {
  onClose: () => void;
  onSubmit: (
    name: string,
    description: string,
    accessMode: "link" | "code",
    expiresAt: string | null,
  ) => Promise<unknown>;
  isCreating: boolean;
}

export default function CreateWallModal({
  onClose,
  onSubmit,
  isCreating,
}: CreateWallModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [accessMode, setAccessMode] = useState<"link" | "code">("link");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (!trimmedName) {
      setError("Give your Wall a name.");
      return;
    }

    if (trimmedName.length > 80) {
      setError("Wall name must be 80 characters or fewer.");
      return;
    }

    if (trimmedDescription.length > 280) {
      setError("Description must be 280 characters or fewer.");
      return;
    }

    try {
      await onSubmit(
        trimmedName,
        trimmedDescription,
        accessMode,
        expiresAt ? new Date(expiresAt).toISOString() : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the Wall.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-stamp text-lg uppercase tracking-wide text-text">
              Create a Wall
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Make a private space for anonymous thoughts.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isCreating}
            className="text-xl leading-none text-text-muted hover:text-text"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="wall-name"
              className="mb-1.5 block text-sm font-medium text-text"
            >
              Wall name
            </label>
            <input
              id="wall-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="e.g. Class of 2026"
              disabled={isCreating}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base text-text outline-none focus:border-text-muted"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="wall-description"
              className="mb-1.5 block text-sm font-medium text-text"
            >
              Description
            </label>
            <textarea
              id="wall-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={280}
              rows={3}
              placeholder="What is this Wall for?"
              disabled={isCreating}
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-base text-text outline-none focus:border-text-muted"
            />
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-text">
              Access
            </legend>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAccessMode("link")}
                disabled={isCreating}
                className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                  accessMode === "link"
                    ? "border-text bg-text text-background"
                    : "border-border text-text hover:bg-surface-hover"
                }`}
              >
                Invite link
              </button>

              <button
                type="button"
                onClick={() => setAccessMode("code")}
                disabled={isCreating}
                className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                  accessMode === "code"
                    ? "border-text bg-text text-background"
                    : "border-border text-text hover:bg-surface-hover"
                }`}
              >
                Link + code
              </button>
            </div>

            <p className="mt-2 text-xs text-text-faint">
              {accessMode === "link"
                ? "Anyone with the private invite link can join."
                : "Participants need the invite link and access code."}
            </p>
          </fieldset>

          <div>
            <label
              htmlFor="wall-expires"
              className="mb-1.5 block text-sm font-medium text-text"
            >
              Expiry <span className="font-normal text-text-faint">(optional)</span>
            </label>
            <input
              id="wall-expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              disabled={isCreating}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base text-text outline-none focus:border-text-muted"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-border px-3 py-2.5 text-sm text-text">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isCreating}
            className="w-full rounded-full bg-text px-5 py-3 text-sm font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? "Creating…" : "Create Wall"}
          </button>
        </form>
      </div>
    </div>
  );
}
