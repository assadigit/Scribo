import type { MetadataRoute } from "next";

/**
 * Scribo is a deliberately private platform: every text lives behind an
 * unguessable share token and is meant only for peer/audience review.
 * Nothing here is meant for the public internet.
 *
 * - All robots (`User-agent: *`) are kept out of reader, admin and auth pages.
 * - Known AI-training crawlers are blocked site-wide — the notes must not
 *   become part of any model's training data.
 * - No sitemap is published, so crawlers have no sanctioned path into
 *   private content.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "Bytespider",
  "Amazonbot",
  "cohere-ai",
  "Meta-ExternalAgent",
  "Doubot",
  "ImagesiftBot",
  "YouBot",
  "Diffbot",
  "FriendlyCrawler",
  "omgili",
  "omgifbot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", disallow: ["/r/", "/admin", "/auth"] },
      // AI crawlers: blocked from the entire site, not just notes.
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, disallow: "/" })),
    ],
    sitemap: undefined,
  };
}