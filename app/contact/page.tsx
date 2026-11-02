import type { Metadata } from "next";
import { Contact } from "@/components/contact";

export const metadata: Metadata = {
  title: "Contact — Scribo",
  description: "How to reach the author of Scribo.",
};

export default function ContactPage() {
  return <Contact />;
}