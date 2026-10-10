import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parseArgs, runCli, UsageError, type CliIo } from "./cli.js";
import { LocalRouterAdapter, type RouterAdapter } from "./core.js";

function testIo(overrides: Partial<CliIo> = {}): CliIo & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return {
    outLines,
    errLines,
    out: (line) => outLines.push(line),
    err: (line) => errLines.push(line),
    readFile: (path) => `file:${path}`,
    router: new LocalRouterAdapter(),
    ...overrides,
  };
}

describe("parseArgs", () => {
  test("empty args print help", () => {
    expect(parseArgs([]).command).toBe("help");
  });

  test("--version selects version", () => {
    expect(parseArgs(["--version"]).command).toBe("version");
  });

  test("summary takes text and top", () => {
    expect(parseArgs(["summary", "--text", "hi", "--top", "2"])).toEqual({
      command: "summary",
      text: "hi",
      topN: 2,
      dryRun: false,
    });
  });

  test("dispatch takes dry run", () => {
    const request = parseArgs(["dispatch", "--text", "hi", "--dry-run"]);
    expect(request.command).toBe("dispatch");
    expect(request.dryRun).toBe(true);
  });

  test("ingest takes vendor id author text and rules", () => {
    const request = parseArgs([
      "ingest",
      "--vendor", "github",
      "--id", "c1",
      "--author", "alice",
      "--text", "hi",
      "--rules", "rules.json",
    ]);
    expect(request.command).toBe("ingest");
    expect(request.rules).toBe("rules.json");
  });

  test("approve takes an id and a store", () => {
    const request = parseArgs(["approve", "--id", "abc", "--store", "q.json"]);
    expect(request.command).toBe("approve");
    expect(request.id).toBe("abc");
    expect(request.store).toBe("q.json");
  });

  test("reply takes vendor target text and live", () => {
    const request = parseArgs(["reply", "--vendor", "github", "--target", "{}", "--text", "hi", "--live"]);
    expect(request.command).toBe("reply");
    expect(request.live).toBe(true);
  });

  test("unknown command throws UsageError", () => {
    expect(() => parseArgs(["frobnicate"])).toThrow(UsageError);
  });

  test("ingest without required flags throws", () => {
    expect(() => parseArgs(["ingest", "--vendor", "github"])).toThrow(/needs --vendor, --id, --author, and --text/);
  });

  test("approve without id throws", () => {
    expect(() => parseArgs(["approve"])).toThrow(/needs --id/);
  });

  test("reply without id or target throws", () => {
    expect(() => parseArgs(["reply", "--text", "hi"])).toThrow(/reply needs --id or --vendor/);
  });

  test("unknown flag throws", () => {
    expect(() => parseArgs(["ingest", "--vendor", "g", "--id", "1", "--author", "a", "--text", "t", "--bogus", "x"])).toThrow(UsageError);
  });

  test("summary without input throws", () => {
    expect(() => parseArgs(["summary"])).toThrow(/needs --text or --file/);
  });

  test("bad top value throws", () => {
    expect(() => parseArgs(["summary", "--text", "hi", "--top", "many"])).toThrow(/--top/);
  });
});

describe("runCli", () => {
  test("summary prints JSON stats", async () => {
    const io = testIo();
    const code = await runCli(["summary", "--text", "hello world hello"], io);
    expect(code).toBe(0);
    expect(JSON.parse(io.outLines[0])).toMatchObject({ words: 3 });
  });

  test("summary reads a file when asked", async () => {
    const io = testIo();
    const code = await runCli(["summary", "--file", "note.txt"], io);
    expect(code).toBe(0);
    expect(JSON.parse(io.outLines[0])).toMatchObject({ words: 1 });
  });

  test("dispatch dry run prints a preview", async () => {
    const io = testIo();
    const code = await runCli(["dispatch", "--text", "hi", "--dry-run"], io);
    expect(code).toBe(0);
    expect(JSON.parse(io.outLines[0])).toMatchObject({ dryRun: true, chars: 2 });
  });

  test("ingest queues a pending draft", async () => {
    const io = testIo();
    const code = await runCli(
      ["ingest", "--vendor", "github", "--id", "c1", "--author", "alice", "--text", "hello"],
      io,
    );
    expect(code).toBe(0);
    const draft = JSON.parse(io.outLines[0]);
    expect(draft).toMatchObject({ vendor: "github", status: "pending", auto: false });
    expect(draft.comment).toMatchObject({ id: "c1", author: "alice" });
  });

  test("ingest auto-approves a known-ask match", async () => {
    const rules = JSON.stringify([{ name: "thanks", pattern: "^thanks", reply: "You are welcome, {author}." }]);
    const io = testIo({ readFile: (path) => (path.endsWith("rules.json") ? rules : `file:${path}`) });
    const code = await runCli(
      ["ingest", "--vendor", "github", "--id", "c1", "--author", "bob", "--text", "thanks for this", "--rules", "rules.json"],
      io,
    );
    expect(code).toBe(0);
    const draft = JSON.parse(io.outLines[0]);
    expect(draft).toMatchObject({ status: "approved", auto: true, text: "You are welcome, bob." });
  });

  test("approve and queue share a file store", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentic-reply-cli-"));
    try {
      const store = join(dir, "queue.json");
      const io = testIo();
      const code = await runCli(
        ["ingest", "--vendor", "slack", "--id", "c1", "--author", "a", "--text", "hi", "--store", store],
        io,
      );
      expect(code).toBe(0);
      const draft = JSON.parse(io.outLines[0]);

      const io2 = testIo();
      const code2 = await runCli(["approve", "--id", draft.id, "--store", store], io2);
      expect(code2).toBe(0);
      expect(JSON.parse(io2.outLines[0])).toMatchObject({ id: draft.id, status: "approved" });

      const io3 = testIo();
      const code3 = await runCli(["queue", "--store", store], io3);
      expect(code3).toBe(0);
      expect(JSON.parse(io3.outLines[0])).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("reply preview prints a dry run without calling the adapter", async () => {
    let called = false;
    const io = testIo({
      createAdapter: () => ({
        name: "github",
        dispatch: async () => {
          called = true;
          return { adapter: "github", id: "x", chars: 1, at: "" };
        },
      }),
    });
    const code = await runCli(
      ["reply", "--vendor", "github", "--target", "{\"owner\":\"o\",\"repo\":\"r\",\"issueNumber\":\"1\"}", "--text", "hi"],
      io,
    );
    expect(code).toBe(0);
    expect(called).toBe(false);
    expect(JSON.parse(io.outLines[0])).toMatchObject({ dryRun: true, adapter: "github", chars: 2 });
  });

  test("reply --live posts through the injected adapter", async () => {
    const sent: string[] = [];
    const spy: RouterAdapter = {
      name: "github",
      dispatch: async (text) => {
        sent.push(text);
        return { adapter: "github", id: "r1", chars: text.length, at: new Date().toISOString() };
      },
    };
    const io = testIo({ createAdapter: () => spy });
    const code = await runCli(
      ["reply", "--vendor", "github", "--target", "{\"owner\":\"o\",\"repo\":\"r\",\"issueNumber\":\"1\"}", "--text", "hi", "--live", "--adapter-config", "{\"token\":\"t\"}"],
      io,
    );
    expect(code).toBe(0);
    expect(sent).toEqual(["hi"]);
    expect(JSON.parse(io.outLines[0])).toMatchObject({
      dryRun: false,
      adapter: "github",
      receipt: { id: "r1" },
    });
  });

  test("reply --live of a pending draft exits 1", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agentic-reply-cli-"));
    try {
      const store = join(dir, "queue.json");
      const io = testIo();
      await runCli(
        ["ingest", "--vendor", "github", "--id", "c1", "--author", "a", "--text", "hi", "--store", store],
        io,
      );
      const draftId = JSON.parse(io.outLines[0]).id;
      const io2 = testIo({ createAdapter: () => ({ name: "github", dispatch: async () => { throw new Error("no"); } }) });
      const code = await runCli(["reply", "--id", draftId, "--live", "--store", store], io2);
      expect(code).toBe(1);
      expect(io2.errLines.join("\n")).toContain("is pending");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("bad usage exits 2", async () => {
    const io = testIo();
    const code = await runCli(["bogus"], io);
    expect(code).toBe(2);
    expect(io.errLines.length).toBeGreaterThan(0);
  });

  test("version prints a version string", async () => {
    const io = testIo();
    const code = await runCli(["--version"], io);
    expect(code).toBe(0);
    expect(io.outLines[0]).toMatch(/^\d+\.\d+\.\d+$/);
  });
});