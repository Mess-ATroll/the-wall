"use client";

import { useEffect, useRef, useState } from "react";
import { ensureAnonymousSession } from "@/lib/supabase";
import {
  createBrick,
  createReport,
  fetchBrickFeed,
  getBrickById,
  setReaction,
  createWall,
} from "@/lib/wallApi";
import { getPostCooldownSecondsRemaining, recordPostSubmitted } from "@/lib/rateLimit";
import { hasReportedBrick, markBrickReported } from "@/lib/reportStorage";
import { buildBrickShareUrl } from "@/lib/shareUrl";
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
import BrickCard from "./BrickCard";
import LeaveBrickModal from "./LeaveBrickModal";
import ReportModal from "./ReportModal";
import Toast from "./Toast";
import MobileLeaveBrickBar from "./MobileLeaveBrickBar";
import CreateWallModal from "@/components/CreateWallModal";

type Status = "loading" | "ready" | "error";

export default function WallApp() {
  const [bricks, setBricks] = useState<Brick[]>([]);
  const [pinnedBrick, setPinnedBrick] = useState<Brick | null>(null);
  const [pinnedNotFound, setPinnedNotFound] = useState(false);
  const [filter, setFilter] = useState<CategoryFilter>("All");
  const [sortMode, setSortMode] = useState<SortMode>("fresh");
  const [status, setStatus] = useState<Status>("loading");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isLeaveBrickOpen, setLeaveBrickOpen] = useState(false);
  const [reportingBrick, setReportingBrick] = useState<Brick | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isCreateWallOpen, setCreateWallOpen] = useState(false);
  const [isCreatingWall, setIsCreatingWall] = useState(false);

  const sessionEstablished = useRef(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prevents overlapping reaction mutations on the same brick — the
  // direct fix for rapid-click races that could roll back a later,
  // successful click using a stale pre-click snapshot.
  const reactingBrickIds = useRef<Set<string>>(new Set());

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

  // Deep-link support: if this page was opened at /brick/:id (a shared
  // link), fetch that specific brick once and show it pinned above the
  // normal feed, regardless of the feed's own filter/sort state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const match = window.location.pathname.match(/^\/brick\/([^/]+)\/?$/);
    if (!match) return;
    const id = match[1];

    (async () => {
      const ok = await ensureAnonymousSession();
      if (!ok) return;
      try {
        const brick = await getBrickById(id);
        if (brick) {
          setPinnedBrick(brick);
        } else {
          setPinnedNotFound(true);
        }
      } catch {
        setPinnedNotFound(true);
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    };
  }, []);

  // Live cooldown countdown, ticking only while the composer is open —
  // replaces the old static "you can post again in Ns" snapshot, which
  // never updated and was the real source of confusing wait times.
  // The initial value is seeded by openComposer() (a plain event
  // handler) at the moment the composer opens; this effect's only job
  // is subscribing to the recurring tick while it stays open.
  useEffect(() => {
    if (!isLeaveBrickOpen) return;

    const interval = setInterval(() => {
      setCooldownSeconds(getPostCooldownSecondsRemaining());
    }, 1000);
    return () => clearInterval(interval);
  }, [isLeaveBrickOpen]);

  function showToast(message: string) {
    setToastMessage(message);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToastMessage(null), 2600);
  }

  function openComposer() {
    setCooldownSeconds(getPostCooldownSecondsRemaining());
    setLeaveBrickOpen(true);
  }

  async function handleCreateWall(
  name: string,
  description: string,
  accessMode: "link" | "code",
  expiresAt: string | null,
) {
  setIsCreatingWall(true);

  try {
    const result = await createWall(
      name,
      description || null,
      accessMode,
      expiresAt,
    );

    setCreateWallOpen(false);
    showToast("Wall created.");
    return result;
  } catch (error) {
    console.error("Create Wall failed:", error);
    throw error instanceof Error
      ? error
      : new Error("Couldn't create the Wall. Try again.");

  } finally {
    setIsCreatingWall(false);
  }
}

  function findBrick(id: string): Brick | undefined {
    return bricks.find((b) => b.id === id) ?? (pinnedBrick?.id === id ? pinnedBrick : undefined);
  }

  function updateBrick(id: string, updater: (b: Brick) => Brick) {
    setBricks((prev) => prev.map((b) => (b.id === id ? updater(b) : b)));
    setPinnedBrick((prev) => (prev && prev.id === id ? updater(prev) : prev));
  }

  async function handleReact(id: string, key: ReactionKey) {
    if (reactingBrickIds.current.has(id)) return; // ignore while a mutation is already in flight
    const brick = findBrick(id);
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

    reactingBrickIds.current.add(id);
    // optimistic update — feels instant, matches the original mock-mode UX
    updateBrick(id, (b) => ({ ...b, reactions: nextReactions, userReaction: nextUserReaction }));

    try {
      await setReaction(id, key);
    } catch {
      // roll back on failure — safe even under the race this used to
      // suffer from, since only one mutation per brick can be in
      // flight at a time now.
      updateBrick(id, (b) => ({
        ...b,
        reactions: prevReactions,
        userReaction: prevUserReaction,
      }));
      showToast("Couldn't save your reaction. Try again.");
    } finally {
      reactingBrickIds.current.delete(id);
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
    const url = buildBrickShareUrl(brick.id);
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ text: brick.text, url }).catch(() => {
        /* user cancelled share — no-op */
      });
    } else {
      handleCopyLink(brick);
    }
  }

  function handleCopyLink(brick: Brick) {
    const url = buildBrickShareUrl(brick.id);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(url)
        .then(() => showToast("Link copied to clipboard."))
        .catch(() => showToast("Couldn't copy the link."));
    } else {
      showToast("Couldn't copy the link.");
    }
  }

  function handleOpenReport(brick: Brick) {
    setReportingBrick(brick);
  }

  async function handleReportSubmit(reason: ReportReason) {
    if (!reportingBrick) return;
    try {
      await createReport(reportingBrick.id, REPORT_REASON_DB_VALUES[reason]);
      markBrickReported(reportingBrick.id);
    } catch {
      throw new Error("Couldn't send the report. Try again.");
    }
  }

  function scrollToFeed() {
    feedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const showFullPageLoading = status === "loading" && bricks.length === 0;
  const showFullPageError = status === "error" && bricks.length === 0;
  const composerDefaultCategory: Category = filter === "All" ? "random" : filter;

  return (
    <>
      <Header onLeaveBrick={openComposer} />
      <CategoryNav active={filter} onChange={setFilter} />

      <Hero
  onLeaveBrick={openComposer}
  onWalkTheWall={scrollToFeed}
  onCreateWall={() => setCreateWallOpen(true)}
/>

      <div ref={feedRef}>
        {pinnedBrick && (
          <section className="mx-auto max-w-[760px] px-4 pt-1">
            <p className="mb-2 font-stamp text-[11px] uppercase tracking-wider text-text-faint">
              Shared Brick
            </p>
            <BrickCard
              brick={pinnedBrick}
              onReact={handleReact}
              onShare={handleShare}
              onCopyLink={handleCopyLink}
              onReport={handleOpenReport}
            />
          </section>
        )}
        {pinnedNotFound && (
          <div className="mx-auto max-w-[760px] px-4 pt-1">
            <p className="text-sm text-text-muted">
              That Brick isn&rsquo;t here anymore — maybe it was removed.
            </p>
          </div>
        )}

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
            onReport={handleOpenReport}
            onLeaveBrick={openComposer}
          />
        )}
      </div>

      <MobileLeaveBrickBar onLeaveBrick={openComposer} />

      {isLeaveBrickOpen && (
        <LeaveBrickModal
          onClose={() => setLeaveBrickOpen(false)}
          onSubmit={handleSubmitBrick}
          defaultCategory={composerDefaultCategory}
          cooldownSeconds={cooldownSeconds}
        />
      )}

      {isCreateWallOpen && (
  <CreateWallModal
    onClose={() => setCreateWallOpen(false)}
    onSubmit={handleCreateWall}
    isCreating={isCreatingWall}
  />
)} 

      {reportingBrick && (
        <ReportModal
          onClose={() => setReportingBrick(null)}
          onSubmit={handleReportSubmit}
          alreadyReported={hasReportedBrick(reportingBrick.id)}
        />
      )}

      {toastMessage && <Toast message={toastMessage} />}
    </>
  );
}
