import { describe, expect, test } from "vitest";
import worker from "./worker.js";

describe("worker", () => {
  test("GET /health reports ok", async () => {
    const response = await worker.fetch(new Request("https://pack.test/health"), {
      PACK_NAME: "probe",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, pack: "probe" });
  });

  test("POST /summarize returns stats", async () => {
    const response = await worker.fetch(
      new Request("https://pack.test/summarize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "one two two" }),
      }),
      {},
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ words: 3 });
  });

  test("POST /summarize rejects a bad body", async () => {
    const response = await worker.fetch(
      new Request("https://pack.test/summarize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: 42 }),
      }),
      {},
    );
    expect(response.status).toBe(400);
  });

  test("POST /ingest queues a comment and never sends", async () => {
    const response = await worker.fetch(
      new Request("https://pack.test/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "c1",
          vendor: "github",
          author: "alice",
          text: "hello",
        }),
      }),
      {},
    );
    expect(response.status).toBe(200);
    const draft = (await response.json()) as {
      status: string;
      auto: boolean;
      vendor: string;
      id: string;
    };
    expect(draft).toMatchObject({ vendor: "github", status: "pending", auto: false });
    expect(draft.id.length).toBeGreaterThan(0);
  });

  test("POST /ingest rejects a missing field", async () => {
    const response = await worker.fetch(
      new Request("https://pack.test/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "c1", vendor: "github" }),
      }),
      {},
    );
    expect(response.status).toBe(400);
  });

  test("POST /ingest rejects invalid JSON", async () => {
    const response = await worker.fetch(
      new Request("https://pack.test/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
      {},
    );
    expect(response.status).toBe(400);
  });

  test("unknown routes return 404", async () => {
    const response = await worker.fetch(new Request("https://pack.test/nowhere"), {});
    expect(response.status).toBe(404);
  });
});