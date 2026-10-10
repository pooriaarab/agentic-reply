# agentic-reply

Answer inbound comments with human approval.

One tool ingests comments, drafts replies, and sends each reply only
after a human approves it. Known-ask rules match routine requests and
auto-approve those replies. The same core runs as a terminal command,
an npm import, and an MCP server.

## Install

```sh
npm install agentic-reply
```

The CLI ships with the package. Run it with npx or from node_modules:

```sh
npx agentic-reply --help
```

## Quick start

Queue one comment:

```sh
npx agentic-reply ingest --vendor github --id c1 --author bob --text "thanks for the fix"
```

The command prints a pending draft. Approve it:

```sh
npx agentic-reply queue
npx agentic-reply approve --id <draft-id>
```

Preview the reply before it sends:

```sh
npx agentic-reply reply --vendor github \
  --target '{"owner":"pooriaarab","repo":"agentic-reply","issueNumber":"1"}' \
  --text "You are welcome."
```

The preview prints a dry run and sends nothing. Add --live to post:

```sh
npx agentic-reply reply --id <draft-id> --live
```

Send an approved draft through its own vendor. Tokens come from the
env vars below.

## Vendors

Each vendor has an adapter. Constructors take explicit values; the
CLI and the MCP server read tokens from env at call sites.

| Vendor | Adapter | Env vars |
| --- | --- | --- |
| GitHub | issue comments | GITHUB_TOKEN |
| Slack | chat.postMessage in a thread | SLACK_BOT_TOKEN |
| Discord | channel message reply | DISCORD_BOT_TOKEN |
| YouTube | comment thread reply | YOUTUBE_OAUTH_TOKEN |
| Reddit | comment reply | REDDIT_ACCESS_TOKEN, REDDIT_USER_AGENT |
| Mastodon | status reply | MASTODON_ACCESS_TOKEN, MASTODON_INSTANCE |
| Webhook | generic POST with optional HMAC | WEBHOOK_URL, WEBHOOK_SECRET |

## Approve-first flow

1. Ingest. A comment enters the queue as a pending draft.
2. Approve. `approve_reply` flips one draft to approved.
3. Preview. `reply_to_comment` runs guards and shows the dry run.
4. Send. Only an approved draft posts. A failed send records nothing.

Known-ask rules change step two. A rule pairs a regex with a reply
template. When the regex matches a comment, the reply fills `{text}`
and `{author}` slots and the draft arrives approved. Routine asks
skip the human; everything else waits.

The worker face queues comments over HTTP at POST /ingest and never
sends them. Sending needs approval outside the worker.

## Three usecases

1. You run one reply from the terminal with ingest, approve, reply.
2. You import the queue and send functions in a script.
3. You let an agent drive the same flow as MCP tools.

## Gates

```sh
npm run build && npm run typecheck && npm test
```

## Release flow

Push to `main` for review. Merge to `release` to publish. The
publish workflow ships only when the version is new.

## Layout

- `src/index.ts`: the library face.
- `src/cli.ts`: the terminal face.
- `src/mcp.ts`: the MCP server. `src/mcp-bin.ts` starts it.
- `src/worker.ts`: the edge worker face.
- `src/comments.ts`: comment and draft models.
- `src/queue.ts`: the approval queue and file store.
- `src/matchers.ts`: known-ask rules and reply templates.
- `src/reply.ts`: preview, send, and the auto-approve path.
- `src/vendors/`: one adapter per vendor plus the registry.
- `src/core.ts`: the shared core, re-exported from agentic-core.
- `agentic-core.d.ts`: the frozen contract.
- `docs/agentic-core.md`: the contract in plain words.

## License

MIT. See `LICENSE`.