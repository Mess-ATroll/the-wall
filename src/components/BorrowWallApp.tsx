"use client";

import { useEffect, useState } from "react";
import {
  fetchPrivateBricks,
  joinWall,
  type JoinedWall,
  type PrivateBrick,
} from "@/lib/wallApi";

export default function BorrowWallApp() {
const [inviteToken, setInviteToken] = useState<string | null>(null);
const [wall, setWall] = useState<JoinedWall | null>(null);
const [bricks, setBricks] = useState<PrivateBrick[]>([]);
const [isJoining, setIsJoining] = useState(true);
const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const path = window.location.pathname;
    const prefix = "/borrow/";
    const token =
      path.startsWith(prefix) && path.length > prefix.length
        ? decodeURIComponent(path.slice(prefix.length))
        : null;

    setInviteToken(token);
  }, []);

  useEffect(() => {
    if (!inviteToken) return;

    const token = inviteToken;
    let cancelled = false;

    async function join() {
      try {
        setIsJoining(true);
        setError(null);

        const result = await joinWall(token);

        if (!cancelled) {
  setWall(result);

  const privateBricks = await fetchPrivateBricks(result.wallId);
  setBricks(privateBricks);
}
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Couldn't join this Wall.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsJoining(false);
        }
      }
    }

    join();

    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  if (!inviteToken) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="font-display text-3xl font-bold text-text">
            WALL INVITE REQUIRED
          </h1>
          <p className="mt-3 text-sm text-text-muted">
            Use a private Wall invite link to enter.
          </p>
        </div>
      </main>
    );
  }

  if (isJoining) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-text-muted">Joining Wall…</p>
      </main>
    );

  }
 if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="font-display text-3xl font-bold text-text">
            CAN&apos;T JOIN THIS WALL
          </h1>
          <p className="mt-3 text-sm text-text-muted">{error}</p>
        </div>
      </main>
    );
  }

  if (!wall) {
    return null;
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-[760px]">
        <header className="mb-8">
          <p className="font-stamp text-xs tracking-wider text-text-muted">
            BORROW A BRICK
          </p>

          <h1 className="mt-2 font-display text-3xl font-bold tracking-wide text-text sm:text-4xl">
            {wall.name}
          </h1>

          {wall.description && (
            <p className="mt-3 max-w-2xl text-sm text-text-muted">
              {wall.description}
            </p>
          )}

          <p className="mt-4 text-xs text-text-faint">
            You are {wall.displayMarker}. Your identity isn&apos;t displayed
            to other participants.
          </p>
        </header>

        <section className="space-y-4">
  {bricks.length === 0 ? (
    <div className="rounded-2xl border border-border bg-surface p-6 text-center">
      <p className="text-sm text-text-muted">
        No Bricks yet. Be the first to leave one.
      </p>
    </div>
  ) : (
    bricks.map((brick) => (
      <article
        key={brick.id}
        className="rounded-2xl border border-border bg-surface p-6"
      >
        <div className="flex items-center justify-between gap-4">
          <span className="font-stamp text-xs tracking-wider text-text-muted">
            {brick.wallDisplayMarker}
          </span>

          <span className="font-stamp text-xs tracking-wider text-text-faint">
            {brick.category}
          </span>
        </div>

        <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-text">
          {brick.content}
        </p>

        <p className="mt-4 text-xs text-text-faint">
          {new Date(brick.createdAt).toLocaleString()}
        </p>
      </article>
    ))
  )}
</section>
      </div>
    </main>
  );
}
