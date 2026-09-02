/**
 * Builds a shareable Brick URL using the actual production origin.
 *
 * Resolution order:
 * 1. NEXT_PUBLIC_SITE_URL, if set — lets you pin share links to a
 *    canonical domain (e.g. a custom domain) regardless of which
 *    origin happens to be serving the page at share-time.
 * 2. window.location.origin — the real, current origin (Cloudflare
 *    Pages production domain, custom domain, or preview URL,
 *    whichever is actually serving the page). This is dynamic, not
 *    hardcoded: it reflects wherever the app is genuinely running.
 *
 * Never falls back to any hardcoded domain string.
 */
export function buildBrickShareUrl(brickId: string): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  const origin =
    configuredOrigin || (typeof window !== "undefined" ? window.location.origin : "");
  return `${origin}/brick/${brickId}`;
}
