import type { Metadata } from "next";
import WallApp from "@/components/WallApp";

export const metadata: Metadata = {
  title: "The Wall — Say something. Leave no name.",
  description:
    "An anonymous wall for thoughts, confessions, jokes, opinions and everything you don't want to sign.",
};

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <WallApp />
    </main>
  );
}
