// The reply flow. Preview first, approve, then send. Approval is the
// gate between draft and delivery for every reply except known-ask
// matches, which arrive pre-approved.

import { randomUUID } from "node:crypto";
import type { InboundComment, ReplyDraft } from "./comments.js";
import {
  createDryRunResult,
  recordCost,
  type DispatchResult,
  type Guards,
  type Logger,
  type RouterAdapter,
} from "./core.js";
import { fillReply, matchKnownAsk, type KnownAsk } from "./matchers.js";
import type { ReplyTarget } from "./vendors/base.js";

export interface ReplyPreviewInput {
  vendor: string;
  target: ReplyTarget;
  text: string;
}

export interface PreviewOptions {
  guards?: Guards;
  logger?: Logger;
}

// Prepares a dry-run result for a reply. Runs the same guard checks a
// real send would, but calls no adapter and records no cost.

export function previewReply(
  draft: ReplyDraft | ReplyPreviewInput,
  options: PreviewOptions = {},
): DispatchResult {
  const text = draft.text;
  options.guards?.checkDispatch(text);
  options.logger?.info(`preview: ${text.length} chars via ${draft.vendor}`);
  return createDryRunResult(text, draft.vendor);
}

export interface SendOptions {
  adapter: RouterAdapter;
  guards?: Guards;
  logger?: Logger;
}

// Sends one reply. Throws unless the draft is approved. Guards run
// again at send time, then the adapter delivers, and the send records
// its cost. A failed send records nothing.

export async function sendReply(
  draft: ReplyDraft,
  options: SendOptions,
): Promise<DispatchResult> {
  if (draft.status !== "approved") {
    throw new Error(`draft "${draft.id}" is ${draft.status}, only approved drafts send`);
  }
  options.guards?.checkDispatch(draft.text);
  const receipt = await options.adapter.dispatch(draft.text);
  options.guards?.recordDispatch();
  recordCost({ kind: "dispatch", adapter: options.adapter.name, units: draft.text.length });
  options.logger?.info(`sent ${draft.text.length} chars via ${options.adapter.name}`);
  return { dryRun: false, adapter: options.adapter.name, chars: draft.text.length, receipt };
}

// The auto path. A comment that matches a known-ask rule becomes an
// approved draft with the filled reply. Everything else stays pending
// for a human.

export function draftForComment(
  comment: InboundComment,
  rules: KnownAsk[],
): { draft: ReplyDraft; matched: KnownAsk | undefined } {
  const matched = matchKnownAsk(comment.text, rules);
  const text = matched ? fillReply(matched.reply, comment) : comment.text;
  const draft: ReplyDraft = {
    id: randomUUID(),
    comment: { ...comment },
    vendor: comment.vendor,
    target: {},
    text,
    status: matched ? "approved" : "pending",
    auto: matched !== undefined,
    createdAt: new Date().toISOString(),
  };
  return { draft, matched };
}