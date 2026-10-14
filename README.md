# agentic-reply

[![npm version](https://img.shields.io/npm/v/agentic-reply)](https://www.npmjs.com/package/agentic-reply)
[![Monthly downloads](https://img.shields.io/npm/dm/agentic-reply)](https://www.npmjs.com/package/agentic-reply)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://opensource.org/license/mit)

[Package](https://www.npmjs.com/package/agentic-reply) · [Setup](#preview-your-first-reply) · [API and commands](#runtime-surfaces) · [Comparisons](#compare) · [llms.txt](https://github.com/pooriaarab/agentic-reply/blob/main/llms.txt)

agentic-reply is an open-source comment reply toolkit for developers who manage approval queues and outbound replies.
It provides a TypeScript software development kit (SDK), command-line interface (CLI), and Model Context Protocol (MCP) server.
You supply inbound comments, reply text, and destination configuration.

## Install

```sh
npm install agentic-reply
```

Use Node.js 18 or later. TypeScript declarations are included; the package has three direct runtime dependencies.

## Preview your first reply

Run a preview without credentials or environment variables:

```sh
npx agentic-reply reply --vendor github --target '{"owner":"example","repo":"project","issueNumber":"1"}' --text "You are welcome."
```

Expect JSON with `dryRun: true` and adapter `github`. No comment is posted.
A preview does not check credentials, required destination fields, or remote permissions.

Save this SDK example as `preview.mjs`, then run `node preview.mjs`:

```js
import { createApprovalQueue, previewReply } from 'agentic-reply';

const queue = createApprovalQueue();
const draft = queue.ingest({
  id: 'c1', vendor: 'github', author: 'bob', text: 'Thanks for the fix.',
}, { text: 'You are welcome.' });
console.log(draft.status);
console.log(previewReply(draft));
```

Expect `pending` followed by a dry-run result. The queue remains in memory unless you supply a file store.

## How it works

```text
Your inbound comment -> supplied text or regex template -> pending / auto-approved draft
                                                        -> explicit approval
                                                        -> preview
                                                        -> configured adapter -> receipt
```

## Why it exists

GitHub issue comments and Slack thread messages use different endpoints and target fields.
agentic-reply adds a small approval queue and common preview/send functions around those outbound APIs.
For broader workflow automation, n8n provides application nodes and workflow infrastructure.

## Compare

Scope checked on 2026-10-14 against [n8n hosting documentation](https://docs.n8n.io/hosting/) and its [GitHub node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.github/).

| Aspect | agentic-reply | n8n |
| --- | --- | --- |
| Scope | Reply library and local queue | Workflow automation with application nodes |
| Configuration | TypeScript, CLI flags, injected dependencies | Workflows and node credentials |
| Execution | Node.js process you run | Self-hosted workflow service or n8n Cloud |
| GitHub path | Create issue comments | GitHub node includes issue comment creation |

## Coverage

| Adapter | Implemented outbound operation | Required constructor fields |
| --- | --- | --- |
| GitHub | ✓ Issue or pull request conversation comment | `token`, `owner`, `repo`, `issueNumber` |
| Slack | ✓ Thread message via `chat.postMessage` | `token`, `channel`, `threadTs` |
| Discord | ✓ Channel message with message reference | `token`, `channelId`, `messageId` |
| YouTube | ✓ Reply to a parent comment | `token`, `parentId` |
| Reddit | ✓ Comment reply | `token`, `thingId`, `userAgent` |
| Mastodon | ✓ Status reply | `token`, `instance`, `inReplyToId` |
| Generic webhook | ✓ JSON POST, optional signature | `url`, optional `secret` |

The registry contains seven implemented adapters and no scaffold-only entries.
Tests use mocked responses; this rewrite includes zero credential-checked integrations.
These adapters send replies. They do not fetch comments or subscribe to vendor events.
GitHub creates conversation comments, not inline pull request review replies.

## Common use cases

1. Repository maintainers: preview and approve a supplied response before posting a GitHub issue comment.
2. Support developers: inject a Slack adapter into a Node.js review workflow for one configured thread.
3. Community teams: match known questions with explicit regex templates before sending through Discord or Mastodon.
4. Agent developers: expose local comment ingestion and approval tools through a custom MCP server.

## Features

- Pending drafts require approval before `sendReply` accepts them.
- Ordered, case-insensitive regex rules fill `{text}` and `{author}` template slots.
- Explicitly configured known-ask rules can create auto-approved drafts.
- Memory queues and JSON file stores support small local inboxes.
- SDK guards can check reply text before previews and sends.
- Generic webhooks support an optional SHA-256 keyed message authentication code (HMAC) signature.
- Process-local cost reports count sent text characters after successful dispatch.

## Runtime surfaces

SDK exports include `createApprovalQueue`, `createJsonFileStore`, `draftForComment`, `previewReply`, `sendReply`, matcher helpers, and seven vendor adapters.
Core text-summary, router, guard, logging, and cost helpers are also re-exported.
CLI commands are `ingest`, `approve`, `queue`, `reply`, `summary`, `dispatch`, `costs`, `mcp`, `help`, and `version`.
`--help`/`-h` and `--version`/`-V` are aliases.
`reply` previews unless `--live` is present. The separate `dispatch` command uses a local router and accepts `--dry-run`.

Start stdio MCP with `npx agentic-reply mcp` or `npx --package agentic-reply agentic-reply-mcp`.
Its seven tools are `ingest_comment`, `list_queue`, `approve_reply`, `reply_to_comment`, `summarize_text`, `dispatch_text`, and `get_cost_report`.
`reply_to_comment` previews by default; `dispatch_text` defaults to local dispatch rather than preview.
The default MCP server has no vendor adapter for live replies. Custom servers must inject an adapter into `createMcpServer`.
That factory lives in the built MCP module, outside the package's root export map.
The source Worker exposes `GET /health`, `POST /summarize`, and `POST /ingest`; it never sends replies.

## Delivery and behavior limits

Preview before every live reply. Send only with a human-approved draft or an explicit user-authorized destination and reply.
The approval flag is local state, not authenticated proof of human review.
Direct CLI and MCP targets create an approved draft internally; they do not require a separate approval action.
Known-ask matching uses regex search, not exact matching unless you anchor the pattern.
Without a matching rule or explicit reply text, the draft repeats the inbound comment. No language model generates replies.

CLI queues are in memory unless every command uses the same `--store` path.
New drafts have empty targets. CLI draft sends need destination fields through `--adapter-config`; `--target` is ignored when `--id` is used.
CLI `queue` and MCP `list_queue` show pending drafts only. Keep approved IDs for later use.
Sending does not mark a draft as sent or prevent another send.
File stores rewrite one JSON array and provide no concurrent-writer lock.

The CLI environment map lowercases variable names without translating them to constructor fields.
For example, `GITHUB_TOKEN` becomes `github_token`, while the adapter requires `token`.
Pass explicit `--adapter-config` fields or construct the SDK adapter yourself; environment variables alone do not configure live CLI replies.
The default MCP server does not read vendor credentials or select adapters from target fields.
An injected adapter owns its destination; MCP `target` does not reconfigure it.

MCP `ingest_comment` returns a different draft ID from the one stored in its queue.
Use `list_queue` to get the stored pending ID before approval. Auto-approved drafts are absent from that pending list.
The Worker also returns a separately generated draft ID and keeps an instance-local queue without a read or approval route.
Neither surface provides a complete durable inbox by default.

MCP reply previews do not pass injected guards; SDK previews do when given `guards`.
CLI reply paths do not supply guards. Live SDK and custom MCP sends can use injected guards.
Adapters default to ten-second timeouts and have no automatic retry or idempotency mechanism.
An uncertain response can follow remote acceptance. Check vendor state before retrying.
Costs are character units, not currency, and reset with the process. Failed sends add no cost entry.

## Integration guides

Use explicit SDK constructor configuration for credentials and destinations.
For example, after reviewing and authorizing a live GitHub reply:

```js
import { GitHubReplyAdapter, sendReply, getCostReport } from 'agentic-reply';

// Use the queue and draft from the quickstart in the same process.
const approved = queue.approve(draft.id);
const adapter = new GitHubReplyAdapter({
  token: process.env.GITHUB_TOKEN,
  owner: 'your-owner', repo: 'your-repo', issueNumber: 1,
});
// This sends a real comment. Run only after explicit user authorization.
const result = await sendReply(approved, { adapter });
console.log(result, getCostReport());
```

Export `GITHUB_TOKEN` before running. The package does not load `.env` files automatically.
SDK constructors take explicit values; use the required fields from the coverage table.
Other conventional variables listed in the registry are `SLACK_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, `YOUTUBE_OAUTH_TOKEN`, and `REDDIT_ACCESS_TOKEN`.
It also lists `REDDIT_USER_AGENT`, `MASTODON_ACCESS_TOKEN`, `MASTODON_INSTANCE`, `WEBHOOK_URL`, and `WEBHOOK_SECRET`.
Read those values yourself and map them to the constructor fields.
Webhook payloads contain `{ reply, at }`; optional signatures use the `x-reply-signature` header over the exact JSON body.

For a persistent local CLI approval preview:

```sh
npx agentic-reply ingest --store ./drafts.json --vendor github --id c1 --author bob --text "Thanks for the fix."
npx agentic-reply queue --store ./drafts.json
# Replace DRAFT_ID with the queued ID.
npx agentic-reply reply --store ./drafts.json --id DRAFT_ID
npx agentic-reply approve --store ./drafts.json --id DRAFT_ID
```

This flow sends nothing. `--rules path.json` on ingestion loads an array of `{ name, pattern, reply }` rules.
Preview text before approval. There is no CLI draft-text editing command; supply reviewed text through the SDK or an explicit target.

- [GitHub issue comment API](https://docs.github.com/en/rest/issues/comments#create-an-issue-comment)
- [Slack thread message API](https://docs.slack.dev/reference/methods/chat.postMessage/)

## Status

Version 0.1.0 is pre-1.0; interfaces can change.
The CLI credential mapping and MCP queue IDs need code fixes before those paths provide the advertised full workflow.
[Report reproducible issues](https://github.com/pooriaarab/agentic-reply/issues) with redacted credentials and personal data.
Public case studies are not yet published in this repository.

## FAQ

### What is agentic-reply?

agentic-reply provides local reply drafts, approval state, previews, and outbound adapters.
You supply comments and response text or regex templates.

### Which integrations are verified?

agentic-reply tests seven adapters with mocked responses.
This rewrite does not verify live credentials or end-to-end vendor delivery.

### Does agentic-reply provide a managed inbox?

agentic-reply runs in your environment and does not fetch inbound comments.
Its queues use memory or a local JSON file rather than a managed inbox service.

### How is agentic-reply different from n8n?

agentic-reply is a Node.js reply library with a small approval queue.
n8n provides broader workflow infrastructure and application nodes, including GitHub comment operations.

### Does agentic-reply generate replies with AI?

agentic-reply has no language model provider for reply generation.
It uses supplied text, a matched template, or the original comment as the draft body.

### Do CLI drafts persist between commands?

agentic-reply CLI drafts persist only when commands share the same `--store` file.
Without that option, each invocation creates a new memory queue.

### Is setting GITHUB_TOKEN enough for CLI live replies?

agentic-reply currently maps that variable to the wrong constructor key.
Supply explicit `token` and destination configuration, or use an SDK adapter that reads your environment value directly.

### Can the default MCP server send live replies?

agentic-reply's default MCP server has no live adapter configured.
A custom server must inject one, and callers must account for the documented queue-ID mismatch.

### Does approval prevent duplicate replies?

agentic-reply checks approved status before sending but retains that status afterward.
Repeated sends can create duplicate replies; there is no sent-state or idempotency check.

## Development and release flow

```sh
npm ci
npm run build
npm run typecheck
npm test
```

The repository publish workflow runs on `release` and skips versions already published.
A README-only change reaches npm on a later package publish.

## License

MIT
