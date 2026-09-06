"use client";

import { useEffect, useState } from "react";
import LeaveBrickModal from "@/components/LeaveBrickModal";
import type { Category } from "@/lib/types";
import { getPostCooldownSecondsRemaining, recordPostSubmitted } from "@/lib/rateLimit";
import {
  createPrivateBrick,
  createPrivateComment,
  fetchPrivateComments,
  fetchPrivateBricks,
  joinWall,
  type JoinedWall,
  type PrivateBrick,
  type PrivateComment,
} from "@/lib/wallApi";

export default function BorrowWallApp() {
const [inviteToken, setInviteToken] = useState<string | null>(null);
const [wall, setWall] = useState<JoinedWall | null>(null);
const [bricks, setBricks] = useState<PrivateBrick[]>([]);
const [comments, setComments] = useState<Record<string, PrivateComment[]>>({});
const [activeCommentBrickId, setActiveCommentBrickId] = useState<string | null>(null);
const [commentText, setCommentText] = useState("");
const [commentCooldownSeconds, setCommentCooldownSeconds] = useState(0);
const [isSubmittingComment, setIsSubmittingComment] = useState(false);
const [isJoining, setIsJoining] = useState(true);
const [error, setError] = useState<string | null>(null);
  const [isLeaveBrickOpen, setLeaveBrickOpen] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (!isLeaveBrickOpen) return;

    const interval = setInterval(() => {
      setCooldownSeconds(getPostCooldownSecondsRemaining());
    }, 1000);

    return () => clearInterval(interval);
  }, [isLeaveBrickOpen]);

  useEffect(() => {
  if (!activeCommentBrickId) return;

  const interval = setInterval(() => {
    setCommentCooldownSeconds(getCommentCooldownSecondsRemaining());
  }, 1000);

  return () => clearInterval(interval);
}, [activeCommentBrickId]);

  function getCommentCooldownSecondsRemaining(): number {
  if (typeof window === "undefined") return 0;

  const raw = window.localStorage.getItem("wall_last_comment_at");
  if (!raw) return 0;

  const lastCommentAt = Number(raw);
  if (Number.isNaN(lastCommentAt)) return 0;

  const elapsed = Date.now() - lastCommentAt;
  const remaining = 10_000 - elapsed;

  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}
async function handleSubmitPrivateComment(brickId: string) {
  const text = commentText.trim();

  if (!text) return;

  const cooldown = getCommentCooldownSecondsRemaining();

  if (cooldown > 0) {
    setCommentCooldownSeconds(cooldown);
    return;
  }

  setIsSubmittingComment(true);

  try {
    const newComment = await createPrivateComment(brickId, text);

    setComments((prev) => ({
      ...prev,
      [brickId]: [...(prev[brickId] ?? []), newComment],
    }));

    window.localStorage.setItem(
      "wall_last_comment_at",
      String(Date.now()),
    );

    setCommentText("");
    setActiveCommentBrickId(null);
    setCommentCooldownSeconds(0);
  } catch (error) {
    console.error("Failed to create private comment:", error);
  } finally {
    setIsSubmittingComment(false);
  }
}
  async function handleSubmitPrivateBrick(text: string, category: Category) {
    if (!wall) return;

    const cooldown = getPostCooldownSecondsRemaining();
    if (cooldown > 0) {
      throw new Error("Slow down - you can post again in " + cooldown + "s.");
    }

    let newBrick: PrivateBrick;
    try {
      newBrick = await createPrivateBrick(wall.wallId, text, category);
    } catch (error) {
      throw new Error(JSON.stringify(error));
    }

    recordPostSubmitted();
    setBricks((prev) => [newBrick, ...prev]);
    setLeaveBrickOpen(false);
  }

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

  const commentEntries = await Promise.all(
  privateBricks.map(async (brick) => {
    try {
      const privateComments = await fetchPrivateComments(brick.id);
      return [brick.id, privateComments] as const;
    } catch (error) {
      console.error(
        `Failed to load comments for Brick ${brick.id}:`,
        error,
      );
      return [brick.id, []] as const;
    }
  }),
);

  if (!cancelled) {
    setComments(Object.fromEntries(commentEntries));
  }
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

        <button
          type="button"
          onClick={() => {
            setCooldownSeconds(getPostCooldownSecondsRemaining());
            setLeaveBrickOpen(true);
          }}
          className="mb-6 w-full rounded-2xl border border-border bg-surface px-5 py-4 text-sm font-semibold text-text transition hover:bg-surface-muted"
        >
          Leave a Brick
        </button>

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

        <button
  type="button"
  onClick={() => {
    setActiveCommentBrickId(brick.id);
    setCommentText("");
    setCommentCooldownSeconds(getCommentCooldownSecondsRemaining());
  }}
  className="mt-4 text-sm font-semibold text-text-muted transition hover:text-text"
>
  Add a comment
</button>

{activeCommentBrickId === brick.id && (
  <div className="mt-4 rounded-xl border border-border bg-surface-muted p-4">
    <textarea
      value={commentText}
      onChange={(event) => setCommentText(event.target.value.slice(0, 280))}
      placeholder="Write a comment..."
      maxLength={280}
      rows={3}
      className="w-full resize-none rounded-xl border border-border bg-surface p-3 text-base text-text outline-none placeholder:text-text-faint focus:border-text-muted"
      disabled={isSubmittingComment}
    />

    <div className="mt-3 flex items-center justify-between gap-3">
      <span className="text-xs text-text-faint">
        {commentText.length}/280
      </span>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setActiveCommentBrickId(null);
            setCommentText("");
            setCommentCooldownSeconds(0);
          }}
          className="rounded-lg px-3 py-2 text-sm text-text-muted transition hover:bg-surface"
          disabled={isSubmittingComment}
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={() => handleSubmitPrivateComment(brick.id)}
          disabled={
            !commentText.trim() ||
            isSubmittingComment ||
            commentCooldownSeconds > 0
          }
          className="rounded-lg bg-text px-3 py-2 text-sm font-semibold text-surface transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmittingComment
            ? "Posting..."
            : commentCooldownSeconds > 0
              ? `Wait ${commentCooldownSeconds}s`
              : "Comment"}
        </button>
      </div>
    </div>
  </div>
)}

        {comments[brick.id]?.length > 0 && (
          <div className="mt-6 border-t border-border pt-5">
            <p className="mb-3 font-stamp text-xs tracking-wider text-text-muted">
              COMMENTS
            </p>

            <div className="space-y-3">
              {comments[brick.id].map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-xl bg-surface-muted p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-stamp text-xs tracking-wider text-text-muted">
                      {comment.wallDisplayMarker}
                    </span>

                    <span className="text-xs text-text-faint">
                      {new Date(comment.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text">
                    {comment.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </article>
    ))
  )}
</section>
      {isLeaveBrickOpen && (
        <LeaveBrickModal
          onClose={() => setLeaveBrickOpen(false)}
          onSubmit={handleSubmitPrivateBrick}
          defaultCategory="random"
          cooldownSeconds={cooldownSeconds}
        />
      )}

      </div>
    </main>
  );
}
