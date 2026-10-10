#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { validateComment, type InboundComment, type ReplyDraft } from "./comments.js";
import {
  dispatchText,
  getCostReport,
  GuardError,
  LocalRouterAdapter,
  summarizeText,
  VendorError,
  type RouterAdapter,
} from "./core.js";
import { DEFAULT_BRAND } from "./index.js";
import { matchKnownAsk, type KnownAsk } from "./matchers.js";
import { createApprovalQueue, createJsonFileStore } from "./queue.js";
import { draftForComment, previewReply, sendReply } from "./reply.js";
import { VERSION } from "./version.js";
import { createReplyAdapter, VENDOR_ENV, VENDOR_NAMES, type AdapterOptions } from "./vendors/registry.js";
import type { ReplyTarget } from "./vendors/base.js";

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export type CliCommand =
  | "summary"
  | "dispatch"
  | "costs"
  | "mcp"
  | "help"
  | "version"
  | "ingest"
  | "approve"
  | "queue"
  | "reply";

export interface CliRequest {
  command: CliCommand;
  text?: string;
  file?: string;
  dryRun: boolean;
  topN?: number;
  vendor?: string;
  id?: string;
  author?: string;
  url?: string;
  rules?: string;
  store?: string;
  target?: string;
  adapterConfig?: string;
  live?: boolean;
}

const COMMANDS = new Set<string>([
  "summary",
  "dispatch",
  "costs",
  "mcp",
  "help",
  "version",
  "ingest",
  "approve",
  "queue",
  "reply",
]);

const VALUE_FLAGS = new Set<string>([
  "--text",
  "--file",
  "--top",
  "--vendor",
  "--id",
  "--author",
  "--url",
  "--rules",
  "--store",
  "--target",
  "--adapter-config",
]);

export function parseArgs(argv: string[]): CliRequest {
  const request: CliRequest = { command: "help", dryRun: false };
  const args = [...argv];
  const first = args.shift();
  if (first === undefined || first === "--help" || first === "-h") {
    return request;
  }
  if (first === "--version" || first === "-V") {
    request.command = "version";
    return request;
  }
  if (!COMMANDS.has(first)) {
    throw new UsageError(`unknown command "${first}"`);
  }
  request.command = first as CliCommand;
  while (args.length > 0) {
    const flag = args.shift() as string;
    if (flag === "--dry-run" && request.command === "dispatch") {
      request.dryRun = true;
      continue;
    }
    if (flag === "--live" && request.command === "reply") {
      request.live = true;
      continue;
    }
    if (VALUE_FLAGS.has(flag) && args.length > 0) {
      const value = args.shift() as string;
      switch (flag) {
        case "--text":
          request.text = value;
          break;
        case "--file":
          request.file = value;
          break;
        case "--top": {
          const topN = Number.parseInt(value, 10);
          if (!Number.isInteger(topN) || topN < 0) {
            throw new UsageError(`--top needs an integer of 0 or more, got "${value}"`);
          }
          request.topN = topN;
          break;
        }
        case "--vendor":
          request.vendor = value;
          break;
        case "--id":
          request.id = value;
          break;
        case "--author":
          request.author = value;
          break;
        case "--url":
          request.url = value;
          break;
        case "--rules":
          request.rules = value;
          break;
        case "--store":
          request.store = value;
          break;
        case "--target":
          request.target = value;
          break;
        case "--adapter-config":
          request.adapterConfig = value;
          break;
      }
      continue;
    }
    throw new UsageError(`unknown flag "${flag}" for "${request.command}"`);
  }

  if (
    (request.command === "summary" || request.command === "dispatch") &&
    request.text === undefined &&
    request.file === undefined
  ) {
    throw new UsageError(`${request.command} needs --text or --file`);
  }
  if (
    request.command === "ingest" &&
    (request.vendor === undefined || request.id === undefined ||
      request.author === undefined || request.text === undefined)
  ) {
    throw new UsageError("ingest needs --vendor, --id, --author, and --text");
  }
  if (request.command === "approve" && request.id === undefined) {
    throw new UsageError("approve needs --id");
  }
  if (request.command === "reply") {
    const hasTarget = request.vendor !== undefined && request.target !== undefined && request.text !== undefined;
    if (request.id === undefined && !hasTarget) {
      throw new UsageError("reply needs --id or --vendor with --target and --text");
    }
  }
  return request;
}

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
  readFile(path: string): string;
  router: RouterAdapter;
  createAdapter?: (vendor: string, config: unknown, options?: AdapterOptions) => RouterAdapter;
}

function defaultIo(): CliIo {
  return {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    readFile: (path) => readFileSync(path, "utf8"),
    router: new LocalRouterAdapter(),
    createAdapter: (vendor, config, options) => createReplyAdapter(vendor, config, options),
  };
}

function helpText(): string {
  const command = DEFAULT_BRAND.command;
  return [
    `${DEFAULT_BRAND.name} ${VERSION}`,
    `${DEFAULT_BRAND.description}`,
    "",
    `Usage: ${command} <command> [flags]`,
    "",
    "Commands:",
    `  ingest --vendor V --id ID --author A --text T [--url U] [--rules <json>]`,
    "                                     Queue a comment, print the draft. Matches",
    "                                     --rules known asks are auto-approved.",
    `  approve --id ID [--store <path>]   Approve one pending draft, print it.`,
    `  queue [--store <path>]             Print the pending drafts as JSON.`,
    `  reply --vendor V --target <json> --text T [--live] [--adapter-config <json>]`,
    "                                     Preview a reply. --live posts it.",
    `  reply --id ID --live [--adapter-config <json>]  Send an approved draft.`,
    `  summary --text <t> [--file <p>] [--top <n>]     Print text stats as JSON.`,
    `  dispatch --text <t> [--file <p>] [--dry-run]    Route one text, print the receipt.`,
    `  costs                                      Print the cost report as JSON.`,
    `  mcp                                        Start the MCP server on stdio.`,
    "",
    "Flags:",
    "  --help, -h       Print this help.",
    "  --version, -V    Print the version.",
    "",
    "Vendors: github, slack, discord, youtube, reddit, mastodon, webhook.",
    "Tokens come from env: GITHUB_TOKEN, SLACK_BOT_TOKEN, DISCORD_BOT_TOKEN,",
    "YOUTUBE_OAUTH_TOKEN, REDDIT_ACCESS_TOKEN, REDDIT_USER_AGENT,",
    "MASTODON_ACCESS_TOKEN, MASTODON_INSTANCE, WEBHOOK_URL, WEBHOOK_SECRET.",
  ].join("\n");
}

function readInput(request: CliRequest, io: CliIo): string {
  if (request.file !== undefined) {
    return io.readFile(request.file);
  }
  return request.text ?? "";
}

function readRules(request: CliRequest, io: CliIo): KnownAsk[] {
  if (request.rules === undefined) return [];
  const parsed: unknown = JSON.parse(io.readFile(request.rules));
  if (!Array.isArray(parsed)) {
    throw new Error(`rules file ${request.rules} holds no array`);
  }
  return parsed as KnownAsk[];
}

function makeQueue(request: CliRequest): ReturnType<typeof createApprovalQueue> {
  return createApprovalQueue(request.store !== undefined ? createJsonFileStore(request.store) : undefined);
}

function envConfig(vendor: string): Record<string, string> {
  const names = VENDOR_ENV[vendor] ?? [];
  const config: Record<string, string> = {};
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value.length > 0) {
      config[name.toLowerCase()] = value;
    }
  }
  return config;
}

// Builds a constructor config from env, --adapter-config, and --target.
// Explicit values win over env. Adapters never read env themselves.

export function buildAdapterConfig(
  vendor: string,
  target: ReplyTarget,
  adapterConfig: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return { ...envConfig(vendor), ...adapterConfig, ...target };
}

function targetFromRequest(request: CliRequest): ReplyTarget {
  if (request.target === undefined) return {};
  const parsed: unknown = JSON.parse(request.target);
  if (typeof parsed !== "object" || parsed === null) {
    throw new UsageError("--target needs a JSON object");
  }
  const record: Record<string, unknown> = parsed as Record<string, unknown>;
  const clean = Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, String(value)]),
  );
  return clean as ReplyTarget;
}

const requiredFields: Record<string, string[]> = {
  github: ["owner", "repo", "issueNumber", "token"],
  slack: ["channel", "threadTs", "token"],
  discord: ["channelId", "messageId", "token"],
  youtube: ["parentId", "token"],
  reddit: ["thingId", "token", "userAgent"],
  mastodon: ["inReplyToId", "token", "instance"],
  webhook: ["url"],
};

function assertConfigComplete(vendor: string, config: Record<string, unknown>): void {
  const required = requiredFields[vendor] ?? [];
  for (const field of required) {
    const value = config[field];
    if (value === undefined || String(value).trim().length === 0) {
      throw new Error(`reply via ${vendor} needs "${field}" in --target or --adapter-config or env`);
    }
  }
}

// Sends a draft live. Guards and cost recording live in sendReply.

async function handleReply(request: CliRequest, io: CliIo): Promise<number> {
  const makeAdapter = (vendor: string, config: unknown, options?: AdapterOptions): RouterAdapter =>
    io.createAdapter ? io.createAdapter(vendor, config, options) : createReplyAdapter(vendor, config, options);
  const adapterConfig = request.adapterConfig !== undefined
    ? (JSON.parse(request.adapterConfig) as Record<string, unknown>)
    : undefined;

  if (request.id !== undefined) {
    const queue = makeQueue(request);
    const draft = queue.get(request.id);
    if (draft === undefined) {
      throw new Error(`no draft with id "${request.id}"`);
    }
    if (request.live !== true) {
      const result = previewReply(draft);
      io.out(JSON.stringify(result));
      return 0;
    }
    if (draft.status !== "approved") {
      io.err(`draft "${draft.id}" is ${draft.status}; run "approve --id ${draft.id}" first`);
      return 1;
    }
    const target = draft.target as ReplyTarget;
    const config = buildAdapterConfig(draft.vendor, target, adapterConfig);
    assertConfigComplete(draft.vendor, config);
    const adapter = makeAdapter(draft.vendor, config);
    const result = await sendReply(draft, { adapter });
    io.out(JSON.stringify(result));
    return 0;
  }

  if (request.vendor === undefined || request.target === undefined || request.text === undefined) {
    throw new UsageError("reply needs --id or --vendor with --target and --text");
  }
  const target = targetFromRequest(request);
  if (request.live !== true) {
    const result = previewReply({ vendor: request.vendor, target, text: request.text });
    io.out(JSON.stringify(result));
    return 0;
  }
  const config = buildAdapterConfig(request.vendor, target, adapterConfig);
  assertConfigComplete(request.vendor, config);
  const adapter = makeAdapter(request.vendor, config);
  const comment: InboundComment = {
    id: `inline-${Date.now()}`,
    vendor: request.vendor,
    author: "unknown",
    text: request.text,
    url: undefined,
    postedAt: undefined,
  };
  const approved: ReplyDraft = {
    id: comment.id,
    comment,
    vendor: request.vendor,
    target,
    text: request.text,
    status: "approved",
    auto: false,
    createdAt: new Date().toISOString(),
  };
  const result = await sendReply(approved, { adapter });
  io.out(JSON.stringify(result));
  return 0;
}

export async function runCli(argv: string[], io: CliIo = defaultIo()): Promise<number> {
  let request: CliRequest;
  try {
    request = parseArgs(argv);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    io.err(`Run "${DEFAULT_BRAND.command} --help" for usage.`);
    return 2;
  }
  try {
    switch (request.command) {
      case "help":
        io.out(helpText());
        return 0;
      case "version":
        io.out(VERSION);
        return 0;
      case "summary": {
        const summary = summarizeText(readInput(request, io), { topN: request.topN });
        io.out(JSON.stringify(summary));
        return 0;
      }
      case "dispatch": {
        const result = await dispatchText(readInput(request, io), {
          adapter: io.router,
          dryRun: request.dryRun,
        });
        io.out(JSON.stringify(result));
        return 0;
      }
      case "costs":
        io.out(JSON.stringify(getCostReport()));
        return 0;
      case "ingest": {
        const comment: InboundComment = {
          id: request.id as string,
          vendor: request.vendor as string,
          author: request.author as string,
          text: request.text as string,
          url: request.url,
          postedAt: undefined,
        };
        validateComment(comment);
        const rules = readRules(request, io);
        const { draft } = draftForComment(comment, rules);
        const queue = makeQueue(request);
        const queued = queue.ingest(comment, { text: draft.text, auto: draft.auto });
        io.out(JSON.stringify(queued));
        return 0;
      }
      case "approve": {
        const queue = makeQueue(request);
        const draft = queue.approve(request.id as string);
        io.out(JSON.stringify(draft));
        return 0;
      }
      case "queue": {
        const queue = makeQueue(request);
        io.out(JSON.stringify(queue.listPending()));
        return 0;
      }
      case "reply":
        return await handleReply(request, io);
      case "mcp": {
        const { startMcp } = await import("./mcp.js");
        await startMcp();
        return 0;
      }
    }
  } catch (error) {
    if (error instanceof GuardError || error instanceof VendorError || error instanceof UsageError) {
      io.err(`${error.name}: ${error.message}`);
      return 1;
    }
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      io.err(`file not found: ${request.file ?? request.rules ?? ""}`);
      return 1;
    }
    if (error instanceof Error) {
      io.err(`error: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

function isMainModule(): boolean {
  const invoked = process.argv[1];
  if (typeof invoked !== "string") return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(invoked)).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  runCli(process.argv.slice(2)).then(
    (code) => {
      // Exit nonzero at once. On zero, fall off the end so a running
      // server (mcp) keeps its stdio handles open. Plain commands
      // hold no handles and exit 0 on their own.
      if (code !== 0) process.exit(code);
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}