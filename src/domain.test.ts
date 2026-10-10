import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { validateComment, type InboundComment } from "./comments.js";
import { createApprovalQueue, createJsonFileStore } from "./queue.js";
import { fillReply, matchKnownAsk, type KnownAsk } from "./matchers.js";
import { draftForComment, previewReply, sendReply } from "./reply.js";

const comment = (overrides: Partial<InboundComment> = {}): InboundComment => ({
  id: "c1",
  vendor: "github",
  author: "alice",
  text: "hello",
  ...overrides,
});

describe("validateComment", () => {
  test("accepts a full comment", () => {
    expect(() => validateComment(comment())).not.toThrow();
  });

  test("rejects an empty id, vendor, or text", () => {
    expect(() => validateComment(comment({ id: "  " }))).toThrow(/id/);
    expect(() => validateComment(comment({ vendor: "" }))).toThrow(/vendor/);
    expect(() => validateComment(comment({ author: "" }))).toThrow(/author/);
    expect(() => validateComment(comment({ text: "   " }))).toThrow(/text/);
  });
});

describe("approval queue", () => {
  test("ingest queues a pending draft", () => {
    const queue = createApprovalQueue();
    const draft = queue.ingest(comment());
    expect(draft.status).toBe("pending");
    expect(draft.auto).toBe(false);
    expect(draft.id.length).toBeGreaterThan(0);
    expect(queue.listPending()).toHaveLength(1);
  });

  test("approve changes status and reject works too", () => {
    const queue = createApprovalQueue();
    const draft = queue.ingest(comment());
    const approved = queue.approve(draft.id);
    expect(approved.status).toBe("approved");
    expect(queue.listPending()).toHaveLength(0);
    const other = queue.ingest(comment({ id: "c2" }));
    const rejected = queue.reject(other.id);
    expect(rejected.status).toBe("rejected");
  });

  test("only pending drafts can be approved or rejected", () => {
    const queue = createApprovalQueue();
    const draft = queue.ingest(comment());
    queue.approve(draft.id);
    expect(() => queue.approve(draft.id)).toThrow(/only pending/);
    expect(() => queue.reject(draft.id)).toThrow(/only pending/);
  });

  test("unknown id throws", () => {
    const queue = createApprovalQueue();
    expect(() => queue.approve("missing")).toThrow(/no draft with id/);
    expect(() => queue.get("missing")).toThrow(/no draft with id/);
  });

  test("file store persists drafts across queues", () => {
    const dir = mkdtempSync(join(tmpdir(), "agentic-reply-"));
    const path = join(dir, "drafts.json");
    try {
      const first = createApprovalQueue(createJsonFileStore(path));
      const draft = first.ingest(comment({ id: "persist" }));
      first.approve(draft.id);
      const second = createApprovalQueue(createJsonFileStore(path));
      const loaded = second.get(draft.id);
      expect(loaded?.status).toBe("approved");
      const raw = JSON.parse(readFileSync(path, "utf8")) as unknown[];
      expect(raw.length).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("known-ask matchers", () => {
  const rules: KnownAsk[] = [
    { name: "thanks", pattern: "^thanks", reply: "You are welcome, {author}." },
    { name: "pricing", pattern: "how much", reply: "Pricing is on the site, {author}." },
  ];

  test("first matching rule wins, case-insensitive", () => {
    expect(matchKnownAsk("THANKS for this", rules)?.name).toBe("thanks");
    expect(matchKnownAsk("How much does it cost?", rules)?.name).toBe("pricing");
    expect(matchKnownAsk("nothing matches here", rules)).toBeUndefined();
  });

  test("fillReply replaces slots", () => {
    expect(fillReply(rules[0].reply, comment({ author: "bob" }))).toBe("You are welcome, bob.");
  });

  test("invalid regex throws", () => {
    expect(() => matchKnownAsk("hi", [{ name: "bad", pattern: "([", reply: "x" }])).toThrow(/invalid regex/);
  });
});

describe("reply flow", () => {
  test("previewReply runs guards and calls no adapter", () => {
    const queue = createApprovalQueue();
    const draft = queue.ingest(comment());
    const guards = {
      dispatchCount: 0,
      checkDispatch: () => {
        throw new Error("guard ran");
      },
      recordDispatch: () => undefined,
    };
    expect(() => previewReply(draft, { guards })).toThrow("guard ran");
  });

  test("previewReply returns a dry run result", () => {
    const draft = createApprovalQueue().ingest(comment());
    expect(previewReply(draft)).toMatchObject({ dryRun: true, adapter: "github", chars: 5 });
  });

  test("sendReply on a pending draft throws", async () => {
    const draft = createApprovalQueue().ingest(comment());
    const spy = {
      name: "github",
      dispatch: async () => {
        throw new Error("must not run");
      },
    };
    await expect(sendReply(draft, { adapter: spy })).rejects.toThrow(/only approved drafts send/);
  });

  test("approved draft sends and records cost", async () => {
    const { recordCost, resetCosts, getCostReport } = await import("./core.js");
    resetCosts();
    const queue = createApprovalQueue();
    const draft = queue.ingest(comment());
    queue.approve(draft.id);
    const calls: string[] = [];
    const spy = {
      name: "github",
      dispatch: async (text: string) => {
        calls.push(text);
        return { adapter: "github", id: "r1", chars: text.length, at: new Date().toISOString() };
      },
    };
    const result = await sendReply(queue.get(draft.id) as NonNullable<ReturnType<typeof queue.get>>, { adapter: spy });
    expect(result).toMatchObject({ dryRun: false, adapter: "github", chars: 5 });
    expect(calls).toEqual(["hello"]);
    expect(getCostReport().dispatches).toBe(1);
    void recordCost;
  });

  test("draftForComment auto-approves known asks", () => {
    const { draft, matched } = draftForComment(comment({ text: "thanks for the fix" }), [
      { name: "thanks", pattern: "^thanks", reply: "You are welcome, {author}." },
    ]);
    expect(matched?.name).toBe("thanks");
    expect(draft.status).toBe("approved");
    expect(draft.auto).toBe(true);
    expect(draft.text).toContain("alice");
  });

  test("draftForComment leaves unknown asks pending", () => {
    const { draft, matched } = draftForComment(comment({ text: "random musing" }), []);
    expect(matched).toBeUndefined();
    expect(draft.status).toBe("pending");
    expect(draft.auto).toBe(false);
  });
});