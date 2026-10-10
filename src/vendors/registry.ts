// Vendor registry. A factory maps a vendor name to its adapter.
// Constructors take explicit values; tokens come from env at call sites.

import type { RouterAdapter } from "./base.js";
import { GitHubReplyAdapter, type GitHubReplyConfig } from "./github.js";
import { SlackReplyAdapter, type SlackReplyConfig } from "./slack.js";
import { DiscordReplyAdapter, type DiscordReplyConfig } from "./discord.js";
import { YouTubeReplyAdapter, type YouTubeReplyConfig } from "./youtube.js";
import { RedditReplyAdapter, type RedditReplyConfig } from "./reddit.js";
import { MastodonReplyAdapter, type MastodonReplyConfig } from "./mastodon.js";
import { WebhookReplyAdapter, type WebhookReplyConfig } from "./webhook.js";

export type VendorConfig =
  | { vendor: "github"; config: GitHubReplyConfig }
  | { vendor: "slack"; config: SlackReplyConfig }
  | { vendor: "discord"; config: DiscordReplyConfig }
  | { vendor: "youtube"; config: YouTubeReplyConfig }
  | { vendor: "reddit"; config: RedditReplyConfig }
  | { vendor: "mastodon"; config: MastodonReplyConfig }
  | { vendor: "webhook"; config: WebhookReplyConfig };

export interface AdapterOptions {
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export const VENDOR_NAMES = [
  "github",
  "slack",
  "discord",
  "youtube",
  "reddit",
  "mastodon",
  "webhook",
] as const;

export function listVendors(): string[] {
  return [...VENDOR_NAMES];
}

export function createReplyAdapter(vendor: string, config: unknown, options: AdapterOptions = {}): RouterAdapter {
  switch (vendor) {
    case "github":
      return new GitHubReplyAdapter(config as GitHubReplyConfig, options);
    case "slack":
      return new SlackReplyAdapter(config as SlackReplyConfig, options);
    case "discord":
      return new DiscordReplyAdapter(config as DiscordReplyConfig, options);
    case "youtube":
      return new YouTubeReplyAdapter(config as YouTubeReplyConfig, options);
    case "reddit":
      return new RedditReplyAdapter(config as RedditReplyConfig, options);
    case "mastodon":
      return new MastodonReplyAdapter(config as MastodonReplyConfig, options);
    case "webhook":
      return new WebhookReplyAdapter(config as WebhookReplyConfig, options);
    default:
      throw new Error(`unknown vendor "${vendor}", expected one of: ${VENDOR_NAMES.join(", ")}`);
  }
}

// Token source map. Call sites read these env vars and pass explicit
// values into constructors. Adapters never touch env themselves.

export const VENDOR_ENV: Record<string, string[]> = {
  github: ["GITHUB_TOKEN"],
  slack: ["SLACK_BOT_TOKEN"],
  discord: ["DISCORD_BOT_TOKEN"],
  youtube: ["YOUTUBE_OAUTH_TOKEN"],
  reddit: ["REDDIT_ACCESS_TOKEN", "REDDIT_USER_AGENT"],
  mastodon: ["MASTODON_ACCESS_TOKEN", "MASTODON_INSTANCE"],
  webhook: ["WEBHOOK_URL", "WEBHOOK_SECRET"],
};