import { describe, expect, test } from "vitest";
import { VendorError } from "./core.js";
import { postJson } from "./vendors/base.js";
import { GitHubReplyAdapter } from "./vendors/github.js";
import { SlackReplyAdapter } from "./vendors/slack.js";
import { DiscordReplyAdapter } from "./vendors/discord.js";
import { YouTubeReplyAdapter } from "./vendors/youtube.js";
import { RedditReplyAdapter } from "./vendors/reddit.js";
import { MastodonReplyAdapter } from "./vendors/mastodon.js";
import { WebhookReplyAdapter } from "./vendors/webhook.js";
import { createReplyAdapter, listVendors } from "./vendors/registry.js";

interface Call {
  url: string;
  options: RequestInit & { headers: Record<string, string>; body?: string };
}

function makeFetch(
  status: number,
  body: unknown,
  calls: Call[],
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      options: {
        ...init,
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: typeof init?.body === "string" ? init.body : undefined,
      },
    });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function failingFetch(): typeof fetch {
  return (async () => {
    throw new Error("network down");
  }) as typeof fetch;
}

describe("postJson", () => {
  test("throws VendorError on non-2xx with status and body snippet", async () => {
    const calls: Call[] = [];
    const fetchFn = makeFetch(503, "boom body", calls);
    const error = await postJson("https://example.test/hook", { fetchFn }).then(
      () => null,
      (value: unknown) => value,
    );
    expect(error).toBeInstanceOf(VendorError);
    expect((error as VendorError).status).toBe(503);
    expect((error as VendorError).message).toContain("503");
    expect((error as VendorError).message).toContain("boom body");
    expect(calls[0].url).toBe("https://example.test/hook");
    expect(calls[0].options.method).toBe("POST");
  });

  test("throws VendorError when the network fails", async () => {
    await expect(postJson("https://example.test/hook", { fetchFn: failingFetch() })).rejects.toBeInstanceOf(
      VendorError,
    );
  });
});

describe("github adapter", () => {
  test("succeeds and shapes the receipt", async () => {
    const calls: Call[] = [];
    const local = new GitHubReplyAdapter(
      { token: "t", owner: "owner", repo: "repo", issueNumber: "7" },
      { fetchFn: makeFetch(201, { id: "42" }, calls) },
    );
    const receipt = await local.dispatch("thanks");
    expect(receipt).toMatchObject({ adapter: "github", id: "42", chars: 6 });
    expect(Date.parse(receipt.at)).not.toBeNaN();
    expect(calls[0].url).toBe("https://api.github.com/repos/owner/repo/issues/7/comments");
    expect(calls[0].options.method).toBe("POST");
    expect(calls[0].options.headers.accept).toBe("application/vnd.github+json");
    expect(calls[0].options.headers.authorization).toBe("Bearer t");
    expect(JSON.parse(calls[0].options.body ?? "{}")).toEqual({ body: "thanks" });
  });

  test("accepts the numeric id GitHub returns", async () => {
    const local = new GitHubReplyAdapter(
      { token: "t", owner: "o", repo: "r", issueNumber: 1 },
      { fetchFn: makeFetch(201, { id: 42 }, []) },
    );
    const receipt = await local.dispatch("hi");
    expect(receipt).toMatchObject({ adapter: "github", id: "42", chars: 2 });
  });

  test("throws VendorError on non-2xx", async () => {
    const local = new GitHubReplyAdapter(
      { token: "t", owner: "o", repo: "r", issueNumber: "1" },
      { fetchFn: makeFetch(401, "unauthorized", []) },
    );
    await expect(local.dispatch("hi")).rejects.toBeInstanceOf(VendorError);
  });

  test("throws VendorError when the network fails", async () => {
    const local = new GitHubReplyAdapter(
      { token: "t", owner: "o", repo: "r", issueNumber: "1" },
      { fetchFn: failingFetch() },
    );
    await expect(local.dispatch("hi")).rejects.toBeInstanceOf(VendorError);
  });
});

describe("slack adapter", () => {
  test("succeeds with ts as id", async () => {
    const calls: Call[] = [];
    const local = new SlackReplyAdapter(
      { token: "t", channel: "C1", threadTs: "123.456" },
      { fetchFn: makeFetch(200, { ok: true, ts: "999.888" }, calls) },
    );
    const receipt = await local.dispatch("hi");
    expect(receipt).toMatchObject({ adapter: "slack", id: "999.888", chars: 2 });
    expect(calls[0].url).toBe("https://slack.com/api/chat.postMessage");
    expect(calls[0].options.headers.authorization).toBe("Bearer t");
    expect(JSON.parse(calls[0].options.body ?? "{}")).toEqual({
      channel: "C1",
      thread_ts: "123.456",
      text: "hi",
    });
  });

  test("throws VendorError when ok is false", async () => {
    const local = new SlackReplyAdapter(
      { token: "t", channel: "C1", threadTs: "1" },
      { fetchFn: makeFetch(200, { ok: false, error: "invalid_auth" }, []) },
    );
    const error = await local.dispatch("hi").then(
      () => null,
      (value: unknown) => value,
    );
    expect(error).toBeInstanceOf(VendorError);
    expect((error as VendorError).message).toContain("invalid_auth");
  });

  test("throws VendorError when the network fails", async () => {
    const local = new SlackReplyAdapter(
      { token: "t", channel: "C1", threadTs: "1" },
      { fetchFn: failingFetch() },
    );
    await expect(local.dispatch("hi")).rejects.toBeInstanceOf(VendorError);
  });
});

describe("discord adapter", () => {
  test("succeeds and shapes the receipt", async () => {
    const calls: Call[] = [];
    const local = new DiscordReplyAdapter(
      { token: "t", channelId: "111", messageId: "222" },
      { fetchFn: makeFetch(200, { id: "333" }, calls) },
    );
    const receipt = await local.dispatch("hi");
    expect(receipt).toMatchObject({ adapter: "discord", id: "333" });
    expect(calls[0].url).toBe("https://discord.com/api/v10/channels/111/messages");
    expect(calls[0].options.headers.authorization).toBe("Bot t");
    expect(JSON.parse(calls[0].options.body ?? "{}")).toEqual({
      content: "hi",
      message_reference: { message_id: "222" },
    });
  });

  test("throws VendorError on non-2xx and on network failure", async () => {
    const bad = new DiscordReplyAdapter(
      { token: "t", channelId: "1", messageId: "2" },
      { fetchFn: makeFetch(403, "forbidden", []) },
    );
    await expect(bad.dispatch("hi")).rejects.toBeInstanceOf(VendorError);
    const down = new DiscordReplyAdapter(
      { token: "t", channelId: "1", messageId: "2" },
      { fetchFn: failingFetch() },
    );
    await expect(down.dispatch("hi")).rejects.toBeInstanceOf(VendorError);
  });
});

describe("youtube adapter", () => {
  test("succeeds and shapes the receipt", async () => {
    const calls: Call[] = [];
    const local = new YouTubeReplyAdapter(
      { token: "t", parentId: "parent-1" },
      { fetchFn: makeFetch(200, { id: "comment-1" }, calls) },
    );
    const receipt = await local.dispatch("hi");
    expect(receipt).toMatchObject({ adapter: "youtube", id: "comment-1" });
    expect(calls[0].url).toBe("https://www.googleapis.com/youtube/v3/comments?part=snippet");
    expect(calls[0].options.headers.authorization).toBe("Bearer t");
    expect(JSON.parse(calls[0].options.body ?? "{}")).toEqual({
      snippet: { parentId: "parent-1", textOriginal: "hi" },
    });
  });

  test("throws VendorError on non-2xx and on network failure", async () => {
    const bad = new YouTubeReplyAdapter(
      { token: "t", parentId: "p" },
      { fetchFn: makeFetch(400, "bad", []) },
    );
    await expect(bad.dispatch("hi")).rejects.toBeInstanceOf(VendorError);
    const down = new YouTubeReplyAdapter(
      { token: "t", parentId: "p" },
      { fetchFn: failingFetch() },
    );
    await expect(down.dispatch("hi")).rejects.toBeInstanceOf(VendorError);
  });
});

describe("reddit adapter", () => {
  test("succeeds and shapes the receipt", async () => {
    const calls: Call[] = [];
    const local = new RedditReplyAdapter(
      { token: "t", thingId: "t1_abc", userAgent: "probe/1.0" },
      { fetchFn: makeFetch(200, { json: { data: { things: [{ data: { id: "t1_xyz" } }] } } }, calls) },
    );
    const receipt = await local.dispatch("hi");
    expect(receipt).toMatchObject({ adapter: "reddit", id: "t1_xyz" });
    expect(calls[0].url).toBe("https://oauth.reddit.com/api/comment");
    expect(calls[0].options.headers.authorization).toBe("Bearer t");
    expect(calls[0].options.headers["user-agent"]).toBe("probe/1.0");
    expect(calls[0].options.body).toBe("thing_id=t1_abc&text=hi&api_type=json");
  });

  test("throws VendorError when the errors array is non-empty", async () => {
    const local = new RedditReplyAdapter(
      { token: "t", thingId: "t1_a", userAgent: "u" },
      { fetchFn: makeFetch(200, { errors: [["RATELIMIT", "slow down", "t1"]] }, []) },
    );
    const error = await local.dispatch("hi").then(
      () => null,
      (value: unknown) => value,
    );
    expect(error).toBeInstanceOf(VendorError);
    expect((error as VendorError).message).toContain("RATELIMIT");
  });

  test("throws VendorError on network failure", async () => {
    const local = new RedditReplyAdapter(
      { token: "t", thingId: "t1_a", userAgent: "u" },
      { fetchFn: failingFetch() },
    );
    await expect(local.dispatch("hi")).rejects.toBeInstanceOf(VendorError);
  });
});

describe("mastodon adapter", () => {
  test("succeeds and shapes the receipt", async () => {
    const calls: Call[] = [];
    const local = new MastodonReplyAdapter(
      { token: "t", instance: "https://mastodon.example/", inReplyToId: "9" },
      { fetchFn: makeFetch(200, { id: "10" }, calls) },
    );
    const receipt = await local.dispatch("hi");
    expect(receipt).toMatchObject({ adapter: "mastodon", id: "10" });
    expect(calls[0].url).toBe("https://mastodon.example/api/v1/statuses");
    expect(calls[0].options.headers.authorization).toBe("Bearer t");
    expect(JSON.parse(calls[0].options.body ?? "{}")).toEqual({
      status: "hi",
      in_reply_to_id: "9",
    });
  });

  test("throws VendorError on non-2xx and on network failure", async () => {
    const bad = new MastodonReplyAdapter(
      { token: "t", instance: "https://m.example", inReplyToId: "1" },
      { fetchFn: makeFetch(422, "unprocessable", []) },
    );
    await expect(bad.dispatch("hi")).rejects.toBeInstanceOf(VendorError);
    const down = new MastodonReplyAdapter(
      { token: "t", instance: "https://m.example", inReplyToId: "1" },
      { fetchFn: failingFetch() },
    );
    await expect(down.dispatch("hi")).rejects.toBeInstanceOf(VendorError);
  });
});

describe("webhook adapter", () => {
  test("posts {reply, at} and returns a uuid receipt", async () => {
    const calls: Call[] = [];
    const local = new WebhookReplyAdapter(
      { url: "https://hooks.example.test/in", secret: "s3cret" },
      { fetchFn: makeFetch(200, {}, calls) },
    );
    const receipt = await local.dispatch("hi");
    expect(receipt.adapter).toBe("webhook");
    expect(receipt.id.length).toBeGreaterThan(0);
    const body = JSON.parse(calls[0].options.body ?? "{}");
    expect(body.reply).toBe("hi");
    expect(Date.parse(body.at)).not.toBeNaN();
    expect(calls[0].options.headers["x-reply-signature"]).toMatch(/^[0-9a-f]{64}$/);
  });

  test("omits the signature without a secret", async () => {
    const calls: Call[] = [];
    const local = new WebhookReplyAdapter(
      { url: "https://hooks.example.test/in" },
      { fetchFn: makeFetch(200, {}, calls) },
    );
    await local.dispatch("hi");
    expect(calls[0].options.headers["x-reply-signature"]).toBeUndefined();
  });

  test("throws VendorError on non-2xx and on network failure", async () => {
    const bad = new WebhookReplyAdapter(
      { url: "https://hooks.example.test/in" },
      { fetchFn: makeFetch(500, "down", []) },
    );
    await expect(bad.dispatch("hi")).rejects.toBeInstanceOf(VendorError);
    const down = new WebhookReplyAdapter(
      { url: "https://hooks.example.test/in" },
      { fetchFn: failingFetch() },
    );
    await expect(down.dispatch("hi")).rejects.toBeInstanceOf(VendorError);
  });
});

describe("registry", () => {
  test("lists the seven vendors", () => {
    expect(listVendors()).toEqual([
      "github",
      "slack",
      "discord",
      "youtube",
      "reddit",
      "mastodon",
      "webhook",
    ]);
  });

  test("creates an adapter per vendor", () => {
    expect(createReplyAdapter("github", { token: "t", owner: "o", repo: "r", issueNumber: "1" }).name).toBe("github");
    expect(createReplyAdapter("slack", { token: "t", channel: "c", threadTs: "1" }).name).toBe("slack");
    expect(createReplyAdapter("discord", { token: "t", channelId: "c", messageId: "m" }).name).toBe("discord");
    expect(createReplyAdapter("youtube", { token: "t", parentId: "p" }).name).toBe("youtube");
    expect(createReplyAdapter("reddit", { token: "t", thingId: "t", userAgent: "u" }).name).toBe("reddit");
    expect(createReplyAdapter("mastodon", { token: "t", instance: "https://m", inReplyToId: "1" }).name).toBe("mastodon");
    expect(createReplyAdapter("webhook", { url: "https://h" }).name).toBe("webhook");
  });

  test("unknown vendor throws", () => {
    expect(() => createReplyAdapter("carrier-pigeon", {})).toThrow(/unknown vendor/);
  });
});