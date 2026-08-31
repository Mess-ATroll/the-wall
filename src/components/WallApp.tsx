"use client";

import { useEffect, useRef, useState } from "react";
import { ensureAnonymousSession } from "@/lib/supabase";
import { createBrick, createReport, fetchBrickFeed, setReaction } from "@/lib/wallApi";
import { getPostCooldownSecondsRemaining, recordPostSubmitted } from "@/lib/rateLimit";
import type {
  Brick,
  Category,
  CategoryFilter,
  ReactionKey,
  ReportReason,
  SortMode,
} from "@/lib/types";
import { REPORT_REASON_DB_VALUES } from "@/lib/types";
import Header from "./Header";
import CategoryNav from "./CategoryNav";
import Hero from "./Hero";
import WallFeed from "./WallFeed";
import LeaveBrickModal from "./LeaveBrickModal";
import ReportModal from "./ReportModal";
import Toast from "./Toast";
import MobileLeaveBrickBar from "./MobileLeaveBrickBar";

type Status = "loading" | "ready" | "error";

export default function WallApp() {
  const [bricks, setBricks] = useState<Brick[]>([]);
  const [filter, setFilter] = useState<CategoryFilter>("All");
  const [sortMode, setSortMode] = useState<SortMode>("fresh");
  const [status, setStatus] = useState<Status>("loading");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isLeaveBrickOpen, setLeaveBrickOpen] = useState(false);
  const [reportingBrick, setReportingBrick] = useState<Brick | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const sessionEstablished = useRef(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Establishes the silent anonymous session once, then (re)fetches the
  // feed whenever the category filter, sort mode, or a manual retry
  // changes. Session bootstrap is skipped on subsequent runs once it
  // has succeeded — only the feed itself refetches after that.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setStatus("loading");
      setStatusError(null);

      if (!sessionEstablished.current) {
        const ok = await ensureAnonymousSession();
        if (cancelled) return;
        if (!ok) {
          setStatus("error");
          setStatusError("Having trouble connecting. Check your connection and try again.");
          return;
        }
        sessionEstablished.current = true;
      }

      try {
        const data = await fetchBrickFeed({ category: filter, sort: sortMode });
        if (cancelled) return;
        setBricks(data);
        setStatus("ready");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setStatusError("Couldn't load the wall. Try again.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filter, sortMode, retryCount]);

  useEffect(() => {
    return () => {
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    };
  }, []);

  function showToast(message: string) {
    setToastMessage(message);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToastMessage(null), 2600);
  }

  async function handleReact(id: string, key: ReactionKey) {
    const brick = bricks.find((b) => b.id === id);
    if (!brick) return;

    const prevReactions = brick.reactions;
    const prevUserReaction = brick.userReaction;

    const nextReactions = { ...prevReactions };
    let nextUserReaction: ReactionKey | null = key;
    if (prevUserReaction === key) {
      nextReactions[key] = Math.max(0, nextReactions[key] - 1);
      nextUserReaction = null;
    } else {
      if (prevUserReaction) {
        nextReactions[prevUserReaction] = Math.max(0, nextReactions[prevUserReaction] - 1);
      }
      nextReactions[key] = nextReactions[key] + 1;
    }

    // optimistic update — feels instant, matches the original mock-mode UX
    setBricks((prev) =>
      prev.map((b) =>
        b.id === id ? { ...b, reactions: nextReactions, userReaction: nextUserReaction } : b
      )
    );

    try {
      await setReaction(id, key);
    } catch {
      // roll back on failure
      setBricks((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, reactions: prevReactions, userReaction: prevUserReaction } : b
        )
      );
      showToast("Couldn't save your reaction. Try again.");
    }
  }

  async function handleSubmitBrick(text: string, category: Category) {
    const cooldown = getPostCooldownSecondsRemaining();
    if (cooldown > 0) {
      throw new Error(`Slow down — you can post again in ${cooldown}s.`);
    }

    let newBrick: Brick;
    try {
      newBrick = await createBrick(text, category);
    } catch {
      throw new Error("Couldn't post your brick. Check your connection and try again.");
    }

    recordPostSubmitted();
    setBricks((prev) => [newBrick, ...prev]);
    setLeaveBrickOpen(false);
    showToast("Brick added to the wall.");
  }

  function handleShare(brick: Brick) {
    const url = `https://thewall.app/brick/${brick.id}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ text: brick.text, url }).catch(() => {
        /* user cancelled share — no-op */
      });
    } else {
      handleCopyLink(brick);
    }
  }

  function handleCopyLink(brick: Brick) {
    const url = `https://thewall.app/brick/${brick.id}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(url)
        .then(() => showToast("Link copied to clipboard."))
        .catch(() => showToast("Couldn't copy the link."));
    } else {
      showToast("Couldn't copy the link.");
    }
  }

  async function handleReportSubmit(reason: ReportReason) {
    if (!reportingBrick) return;
    try {
      await createReport(reportingBrick.id, REPORT_REASON_DB_VALUES[reason]);
    } catch {
      throw new Error("Couldn't send the report. Try again.");
    }
  }

  function scrollToFeed() {
    feedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const showFullPageLoading = status === "loading" && bricks.length === 0;
  const showFullPageError = status === "error" && bricks.length === 0;

  return (
    <>
      <Header onLeaveBrick={() => setLeaveBrickOpen(true)} />
      <CategoryNav active={filter} onChange={setFilter} />

      <Hero onLeaveBrick={() => setLeaveBrickOpen(true)} onWalkTheWall={scrollToFeed} />

      <div ref={feedRef}>
        {showFullPageError ? (
          <div className="mx-auto flex max-w-[760px] flex-col items-center gap-4 px-4 py-16 text-center">
            <p className="text-text">{statusError}</p>
            <button
              type="button"
              onClick={() => setRetryCount((c) => c + 1)}
              className="rounded-full border border-border px-5 py-2.5 text-sm text-text transition-colors duration-150 hover:bg-surface-hover"
            >
              Try again
            </button>
          </div>
        ) : showFullPageLoading ? (
          <div className="mx-auto max-w-[760px] px-4 py-16 text-center text-text-muted">
            Loading the wall…
          </div>
        ) : (
          <WallFeed
            bricks={bricks}
            sortMode={sortMode}
            onSortChange={setSortMode}
            onReact={handleReact}
            onShare={handleShare}
            onCopyLink={handleCopyLink}
            onReport={setReportingBrick}
            onLeaveBrick={() => setLeaveBrickOpen(true)}
          />
        )}
      </div>

      <MobileLeaveBrickBar onLeaveBrick={() => setLeaveBrickOpen(true)} />

      {isLeaveBrickOpen && (
        <LeaveBrickModal onClose={() => setLeaveBrickOpen(false)} onSubmit={handleSubmitBrick} />
      )}

      {reportingBrick && (
        <ReportModal onClose={() => setReportingBrick(null)} onSubmit={handleReportSubmit} />
      )}

      {toastMessage && <Toast message={toastMessage} />}
    </>
  );
}
