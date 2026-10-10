export { VERSION } from "./version.js";
export {
  defineBrand,
  createLogger,
  GuardError,
  VendorError,
  createGuards,
  LocalRouterAdapter,
  HttpRouterAdapter,
  recordCost,
  getCostReport,
  resetCosts,
  createDryRunResult,
  dispatchText,
  summarizeText,
} from "./core.js";
export type {
  BrandConfig,
  LogLevel,
  Logger,
  LoggerOptions,
  CapsConfig,
  QuietHoursConfig,
  GuardsConfig,
  Guards,
  DispatchReceipt,
  RouterAdapter,
  HttpRouterOptions,
  CostEntry,
  CostReport,
  DispatchOptions,
  DispatchResult,
  TopWord,
  TextSummary,
  SummarizeOptions,
} from "./core.js";

export {
  validateComment,
  type InboundComment,
  type ReplyDraft,
  type DraftStatus,
} from "./comments.js";
export {
  createApprovalQueue,
  createJsonFileStore,
  type ApprovalQueue,
  type DraftStore,
} from "./queue.js";
export {
  matchKnownAsk,
  fillReply,
  compileRules,
  type KnownAsk,
  type CompiledKnownAsk,
} from "./matchers.js";
export {
  previewReply,
  sendReply,
  draftForComment,
  type ReplyPreviewInput,
  type PreviewOptions,
  type SendOptions,
} from "./reply.js";
export { postJson, type ReplyTarget, type PostJsonOptions } from "./vendors/base.js";
export { GitHubReplyAdapter, type GitHubReplyConfig } from "./vendors/github.js";
export { SlackReplyAdapter, type SlackReplyConfig } from "./vendors/slack.js";
export { DiscordReplyAdapter, type DiscordReplyConfig } from "./vendors/discord.js";
export { YouTubeReplyAdapter, type YouTubeReplyConfig } from "./vendors/youtube.js";
export { RedditReplyAdapter, type RedditReplyConfig } from "./vendors/reddit.js";
export { MastodonReplyAdapter, type MastodonReplyConfig } from "./vendors/mastodon.js";
export { WebhookReplyAdapter, type WebhookReplyConfig } from "./vendors/webhook.js";
export {
  createReplyAdapter,
  listVendors,
  VENDOR_NAMES,
  VENDOR_ENV,
  type AdapterOptions,
} from "./vendors/registry.js";

import { defineBrand, type BrandConfig } from "./core.js";
import { VERSION } from "./version.js";

export const DEFAULT_BRAND: BrandConfig = defineBrand({
  name: "Agentic reply",
  command: "agentic-reply",
  description: "Answer inbound comments with human approval.",
  keywords: [
    "comments",
    "auto-reply",
    "inbox",
    "agentic-suite",
    "claude-code",
    "codex",
    "cli",
    "mcp",
  ],
  version: VERSION,
});