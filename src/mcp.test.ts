import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, test } from "vitest";
import { createMcpServer } from "./mcp.js";
import { createApprovalQueue } from "./queue.js";

function textOf(result: unknown): string {
  const content = (result as { content: { type: string; text: string }[] }).content;
  return content[0].text;
}

const commentArgs = {
  id: "c1",
  vendor: "github",
  author: "alice",
  text: "hello there",
};

describe("mcp server", () => {
  test("serves all tools over a client link", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer();
    await server.connect(serverTransport);
    const client = new Client({ name: "probe", version: "0.0.0" });
    await client.connect(clientTransport);
    try {
      const tools = await client.listTools();
      const names = tools.tools.map((tool) => tool.name).sort();
      expect(names).toEqual([
        "approve_reply",
        "dispatch_text",
        "get_cost_report",
        "ingest_comment",
        "list_queue",
        "reply_to_comment",
        "summarize_text",
      ]);

      const summary = await client.callTool({
        name: "summarize_text",
        arguments: { text: "a b a" },
      });
      expect(JSON.parse(textOf(summary))).toMatchObject({ words: 3 });

      const preview = await client.callTool({
        name: "dispatch_text",
        arguments: { text: "hi", dryRun: true },
      });
      expect(JSON.parse(textOf(preview))).toMatchObject({ dryRun: true });

      const report = await client.callTool({ name: "get_cost_report", arguments: {} });
      expect(JSON.parse(textOf(report))).toHaveProperty("dispatches");
    } finally {
      await client.close();
      await server.close();
    }
  });

  test("ingest queues a pending draft and list_queue sees it", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer();
    await server.connect(serverTransport);
    const client = new Client({ name: "probe", version: "0.0.0" });
    await client.connect(clientTransport);
    try {
      const ingested = await client.callTool({ name: "ingest_comment", arguments: commentArgs });
      const draft = JSON.parse(textOf(ingested));
      expect(draft).toMatchObject({ vendor: "github", status: "pending", auto: false });
      const queued = await client.callTool({ name: "list_queue", arguments: {} });
      expect(JSON.parse(textOf(queued))).toHaveLength(1);
    } finally {
      await client.close();
      await server.close();
    }
  });

  test("reply_to_comment defaults to a dry run preview", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const queue = createApprovalQueue();
    const draft = queue.ingest(commentArgs);
    const server = createMcpServer({ queue });
    await server.connect(serverTransport);
    const client = new Client({ name: "probe", version: "0.0.0" });
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({
        name: "reply_to_comment",
        arguments: { draftId: draft.id },
      });
      expect(JSON.parse(textOf(result))).toMatchObject({
        dryRun: true,
        adapter: "github",
        chars: 11,
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  test("approve then live send through the adapter", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const queue = createApprovalQueue();
    const draft = queue.ingest(commentArgs);
    const calls: string[] = [];
    const adapter = {
      name: "github",
      dispatch: async (text: string) => {
        calls.push(text);
        return { adapter: "github", id: "r1", chars: text.length, at: new Date().toISOString() };
      },
    };
    const server = createMcpServer({ queue, adapter });
    await server.connect(serverTransport);
    const client = new Client({ name: "probe", version: "0.0.0" });
    await client.connect(clientTransport);
    try {
      const approved = await client.callTool({
        name: "approve_reply",
        arguments: { id: draft.id },
      });
      expect(JSON.parse(textOf(approved))).toMatchObject({ status: "approved" });

      const sent = await client.callTool({
        name: "reply_to_comment",
        arguments: { draftId: draft.id, dryRun: false },
      });
      expect(JSON.parse(textOf(sent))).toMatchObject({ dryRun: false, adapter: "github" });
      expect(calls).toEqual(["hello there"]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  test("live send of a pending draft is a tool error", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const queue = createApprovalQueue();
    const draft = queue.ingest(commentArgs);
    const server = createMcpServer({
      queue,
      adapter: { name: "github", dispatch: async () => { throw new Error("must not run"); } },
    });
    await server.connect(serverTransport);
    const client = new Client({ name: "probe", version: "0.0.0" });
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({
        name: "reply_to_comment",
        arguments: { draftId: draft.id, dryRun: false },
      });
      expect((result as { isError?: boolean }).isError).toBe(true);
      expect(textOf(result)).toContain("only approved drafts send");
    } finally {
      await client.close();
      await server.close();
    }
  });

  test("a blocked dispatch returns a tool error, not a crash", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const { createGuards } = await import("./core.js");
    const server = createMcpServer({ guards: createGuards({ blocklist: ["nope"] }) });
    await server.connect(serverTransport);
    const client = new Client({ name: "probe", version: "0.0.0" });
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({
        name: "dispatch_text",
        arguments: { text: "nope" },
      });
      expect((result as { isError?: boolean }).isError).toBe(true);
      expect(textOf(result)).toContain("blocklisted");
    } finally {
      await client.close();
      await server.close();
    }
  });
});