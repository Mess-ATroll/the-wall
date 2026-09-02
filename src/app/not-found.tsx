import type { Metadata } from "next";
import WallApp from "@/components/WallApp";

export const metadata: Metadata = {
  title: "The Wall — Say something. Leave no name.",
  description:
    "An anonymous wall for thoughts, confessions, jokes, opinions and everything you don't want to sign.",
};

// Deliberately renders the same app as the homepage rather than a
// generic "not found" message. Next's static export always generates
// SOME file for unmatched routes (404.html / _not-found.html) — this
// makes that file a fully working copy of the app instead of dead-end
// boilerplate, so a direct /brick/:id visit still works even if it
// reaches this page rather than being rewritten to index.html.
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col">
      <WallApp />
    </main>
  );
}
