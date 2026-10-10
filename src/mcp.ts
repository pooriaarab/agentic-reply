import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { validateComment, type ReplyDraft } from "./comments.js";
import {
  createLogger,
  dispatchText,
  getCostReport,
  GuardError,
  LocalRouterAdapter,
  summarizeText,
  VendorError,
  type Guards,
  type Logger,
  type RouterAdapter,
} from "./core.js";
import { DEFAULT_BRAND } from "./index.js";
import { type KnownAsk } from "./matchers.js";
import { createApprovalQueue, type ApprovalQueue } from "./queue.js";
import { draftForComment, previewReply, sendReply } from "./reply.js";
import type { ReplyTarget } from "./vendors/base.js";

export interface McpDeps {
  router?: RouterAdapter;
  adapter?: RouterAdapter;
  guards?: Guards;
  logger?: Logger;
  queue?: ApprovalQueue;
  rules?: KnownAsk[];
}

const textShape = {
  text: z.string().describe("The text to handle."),
};

const commentShape = {
  id: z.string().describe("Vendor comment id."),
  vendor: z.string().describe("Source vendor, like github or slack."),
  author: z.string().describe("Author display name."),
  text: z.string().describe("The comment body."),
  url: z.string().optional().describe("Link back to the comment."),
  postedAt: z.string().optional().describe("ISO timestamp of the comment."),
};

function errorResult(error: unknown): {
  content: { type: "text"; text: string }[];
  isError: true;
} {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
}

function okResult(value: unknown): {
  content: { type: "text"; text: string }[];
} {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

export function createMcpServer(deps: McpDeps = {}): McpServer {
  const router = deps.router ?? new LocalRouterAdapter();
  const adapter = deps.adapter;
  const guards = deps.guards;
  const logger = deps.logger ?? createLogger({ quiet: true });
  const queue = deps.queue ?? createApprovalQueue();
  const rules = deps.rules ?? [];
  const server = new McpServer({
    name: DEFAULT_BRAND.command,
    version: DEFAULT_BRAND.version,
  });

  server.registerTool(
    "summarize_text",
    {
      description: "Count chars, words, and lines in a text, with top words.",
      inputSchema: textShape,
      annotations: { readOnlyHint: true },
    },
    async ({ text }) => okResult(summarizeText(text)),
  );

  server.registerTool(
    "dispatch_text",
    {
      description: "Route one text through the pack router. Pass dryRun to preview only.",
      inputSchema: {
        ...textShape,
        dryRun: z.boolean().optional().describe("Preview the route without delivery."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ text, dryRun }) => {
      try {
        return okResult(await dispatchText(text, { adapter: router, guards, logger, dryRun: dryRun ?? false }));
      } catch (error) {
        if (error instanceof GuardError || error instanceof VendorError) {
          return errorResult(error);
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "get_cost_report",
    {
      description: "Read the cost report for this session.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => okResult(getCostReport()),
  );

  server.registerTool(
    "ingest_comment",
    {
      description: "Queue one inbound comment. Returns a pending draft unless a known-ask rule matches, which auto-approves it.",
      inputSchema: commentShape,
      annotations: { readOnlyHint: false },
    },
    async (args) => {
      try {
        const comment = {
          id: args.id,
          vendor: args.vendor,
          author: args.author,
          text: args.text,
          url: args.url,
          postedAt: args.postedAt,
        };
        validateComment(comment);
        const { draft } = draftForComment(comment, rules);
        queue.ingest(comment, { text: draft.text, auto: draft.auto });
        return okResult(draft);
      } catch (error) {
        if (error instanceof Error) return errorResult(error);
        throw error;
      }
    },
  );

  server.registerTool(
    "approve_reply",
    {
      description: "Approve one pending draft. Only approved drafts can be sent.",
      inputSchema: {
        id: z.string().describe("Draft id from ingest_comment or list_queue."),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ id }) => {
      try {
        return okResult(queue.approve(id));
      } catch (error) {
        if (error instanceof Error) return errorResult(error);
        throw error;
      }
    },
  );

  server.registerTool(
    "list_queue",
    {
      description: "List pending drafts that wait for approval.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => okResult(queue.listPending()),
  );

  server.registerTool(
    "reply_to_comment",
    {
      description:
        "Preview or send a reply. dryRun defaults to true, which checks guards and shows the preview without sending. Live sends need dryRun false plus an approved draft (draftId) or an explicit vendor target.",
      inputSchema: {
        draftId: z.string().optional().describe("Approved draft id from the queue."),
        vendor: z.string().optional().describe("Vendor name for a direct target, like github."),
        target: z.record(z.string()).optional().describe("Vendor target fields, like {owner, repo, issueNumber}."),
        text: z.string().optional().describe("Reply body for a direct target."),
        dryRun: z.boolean().optional().describe("Preview without sending. Defaults to true."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ draftId, vendor, target, text, dryRun }) => {
      const preview = dryRun !== false;
      try {
        if (draftId !== undefined) {
          const draft = queue.get(draftId);
          if (draft === undefined) {
            return errorResult(new Error(`no draft with id "${draftId}"`));
          }
          if (preview) {
            return okResult(previewReply(draft));
          }
          if (draft.status !== "approved") {
            return errorResult(new Error(`draft "${draftId}" is ${draft.status}, only approved drafts send`));
          }
          if (adapter === undefined) {
            return errorResult(new Error("no adapter configured for live sends"));
          }
          return okResult(await sendReply(draft, { adapter, guards, logger }));
        }
        if (vendor === undefined || target === undefined) {
          return errorResult(new Error("reply needs a draftId or a vendor with target"));
        }
        const replyText = text ?? "";
        const comment = {
          id: `mcp-${randomUUID()}`,
          vendor,
          author: "unknown",
          text: replyText,
        };
        if (preview) {
          return okResult(previewReply({ vendor, target: target as ReplyTarget, text: replyText }));
        }
        if (adapter === undefined) {
          return errorResult(new Error("no adapter configured for live sends"));
        }
        const approved: ReplyDraft = {
          id: comment.id,
          comment,
          vendor,
          target: target as ReplyTarget,
          text: replyText,
          status: "approved",
          auto: false,
          createdAt: new Date().toISOString(),
        };
        return okResult(await sendReply(approved, { adapter, guards, logger }));
      } catch (error) {
        if (error instanceof GuardError || error instanceof VendorError) {
          return errorResult(error);
        }
        if (error instanceof Error) return errorResult(error);
        throw error;
      }
    },
  );

  return server;
}

export async function startMcp(deps: McpDeps = {}): Promise<void> {
  const server = createMcpServer(deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}