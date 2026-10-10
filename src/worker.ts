import { validateComment, type InboundComment } from "./comments.js";
import { summarizeText } from "./core.js";
import { createApprovalQueue } from "./queue.js";
import { draftForComment } from "./reply.js";
import { VERSION } from "./version.js";

export interface WorkerEnv {
  PACK_NAME?: string;
}

// One queue per worker instance. Drafts never leave this process, so
// the worker is a queueing face, not a sender. Sending needs approval
// and a human outside this worker.

const queue = createApprovalQueue();

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, pack: env.PACK_NAME ?? "agentic-reply", version: VERSION });
    }
    if (request.method === "POST" && url.pathname === "/summarize") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "body must be JSON" }, 400);
      }
      if (typeof body !== "object" || body === null || !("text" in body)) {
        return json({ error: "body needs a text string" }, 400);
      }
      const { text } = body as { text: unknown };
      if (typeof text !== "string") {
        return json({ error: "body needs a text string" }, 400);
      }
      return json(summarizeText(text));
    }
    if (request.method === "POST" && url.pathname === "/ingest") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "body must be JSON" }, 400);
      }
      if (typeof body !== "object" || body === null) {
        return json({ error: "body needs a comment object" }, 400);
      }
      const comment = body as Partial<InboundComment>;
      if (
        typeof comment.id !== "string" ||
        typeof comment.vendor !== "string" ||
        typeof comment.author !== "string" ||
        typeof comment.text !== "string"
      ) {
        return json({ error: "comment needs id, vendor, author, and text strings" }, 400);
      }
      try {
        const inbound: InboundComment = {
          id: comment.id,
          vendor: comment.vendor,
          author: comment.author,
          text: comment.text,
          url: comment.url,
          postedAt: comment.postedAt,
        };
        validateComment(inbound);
        const { draft } = draftForComment(inbound, []);
        queue.ingest(inbound, { text: draft.text, auto: draft.auto });
        return json(draft, 200);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
    }
    return json({ error: "not found" }, 404);
  },
};