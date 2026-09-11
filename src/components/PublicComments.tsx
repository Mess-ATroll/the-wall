"use client";

import { useState } from "react";
import type { PublicCommentPreview } from "@/lib/types";
import { formatTimeAgo } from "@/lib/formatTime";
import { createPublicComment, fetchPublicComments } from "@/lib/wallApi";

interface PublicCommentsProps {
  brickId: string;
  commentCount: number;
  commentPreview: PublicCommentPreview[];
}

export default function PublicComments({
  brickId,
  commentCount,
  commentPreview,
}: PublicCommentsProps) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState(commentPreview);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function openComments() {
    setExpanded(true);
    if (commentCount > comments.length && !loading) {
      setLoading(true);
      setError("");
      try {
        setComments(await fetchPublicComments(brickId));
      } catch {
        setError("Couldn't load comments.");
      } finally {
        setLoading(false);
      }
    }
  }

  async function submitComment() {
    const content = text.trim();
    if (!content || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const comment = await createPublicComment(brickId, content);
      setComments((current) => [...current, comment]);
      setText("");
      setExpanded(true);
    } catch {
      setError("Couldn't post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  const visibleComments = expanded ? comments : comments.slice(0, 3);

  return (
    <div className="mt-4 border-t border-border pt-3">
      {visibleComments.map((comment) => (
        <div key={comment.id} className="mb-3">
          <div className="flex items-center gap-2">
            <span className="font-stamp text-[11px] text-accent">Anonymous</span>
            <time className="font-stamp text-[10px] text-text-faint">
              {formatTimeAgo(comment.createdAt)}
            </time>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-text">
            {comment.content}
          </p>
        </div>
      ))}

      {loading && (
        <p className="text-sm text-text-faint">Loading comments...</p>
      )}

      {!expanded && commentCount > 3 && (
        <button
          type="button"
          onClick={openComments}
          className="text-sm text-accent hover:underline"
        >
          View all {commentCount} comments
        </button>
      )}

      {expanded && (
        <>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, 280))}
            placeholder="Add a comment..."
            maxLength={280}
            rows={2}
            className="mt-2 w-full resize-none rounded-xl border border-border bg-background p-3 text-sm text-text outline-none focus:border-accent"
          />

          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-text-faint">{text.length}/280</span>
            <button
              type="button"
              disabled={!text.trim() || submitting}
              onClick={submitComment}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {submitting ? "Posting..." : "Comment"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-2 text-sm text-text-faint hover:text-text"
          >
            Hide comments
          </button>
        </>
      )}

      {!expanded && commentCount <= 3 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-sm text-text-faint hover:text-text"
        >
          Add a comment
        </button>
      )}

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
