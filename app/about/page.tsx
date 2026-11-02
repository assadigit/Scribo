import type { Metadata } from "next";
import { About } from "@/components/about";

export const metadata: Metadata = {
  title: "About — Scribo",
  description: "What Scribo is: a private space for long-form writing and notes.",
};

export default function AboutPage() {
  return <About />;
}