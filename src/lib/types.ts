export const CATEGORIES = [
  "random",
  "funny",
  "thoughts",
  "confessions",
  "dark",
  "wholesome",
  "rants",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const REACTIONS = [
  { key: "felt", emoji: "❤️", label: "Felt this" },
  { key: "funny", emoji: "😂", label: "Made me laugh" },
  { key: "same", emoji: "🤝", label: "Same" },
  { key: "interesting", emoji: "👀", label: "Interesting" },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]["key"];

export type ReactionCounts = Record<ReactionKey, number>;

export interface Brick {
  id: string;
  category: Category;
  text: string;
  /** ISO timestamp from the DB (bricks.created_at). Drives both display and "Fresh" ordering. */
  createdAt: string;
  reactions: ReactionCounts;
  /** The reaction this browser gave, read from local storage — not from the DB (reactions has no public SELECT policy). */
  userReaction: ReactionKey | null;
}

export const REPORT_REASONS = [
  "Spam",
  "Harassment",
  "Hate",
  "Inappropriate",
  "Other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/** Lowercase values matching reports.reason's DB check constraint. */
export const REPORT_REASON_DB_VALUES: Record<ReportReason, string> = {
  Spam: "spam",
  Harassment: "harassment",
  Hate: "hate",
  Inappropriate: "inappropriate",
  Other: "other",
};

export type SortMode = "fresh" | "trending";

export type CategoryFilter = "All" | Category;
