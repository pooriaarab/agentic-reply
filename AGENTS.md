# agentic-reply agent guide

Answer inbound comments with human approval.

## Mental model

A comment comes in. A draft forms. A human approves it, and only then
does a reply go out. Known-ask rules skip the human only for replies
they match exactly. One core serves all three faces, so each face
returns the same shapes.

## The three faces

- SDK: `import { createApprovalQueue, previewReply, sendReply } from "agentic-reply"`.
- CLI: `npx agentic-reply ingest --vendor github --id c1 --author bob --text "hi"`.
- MCP: `npx agentic-reply mcp`, then call a tool below.

Keywords: comments, auto-reply, inbox, agentic-suite, claude-code, codex, cli, mcp.

## MCP tasks

| Tool | Use it for |
| --- | --- |
| ingest_comment | Queue one comment. Returns a pending draft. |
| list_queue | Read the drafts that wait for approval. |
| approve_reply | Approve one draft. Gate for a live send. |
| reply_to_comment | Preview a reply, or send it when dryRun is false. |
| summarize_text | Count chars, words, lines, top words. |
| dispatch_text | Route one text on the core router. |
| get_cost_report | Read session cost totals. |

## The loop

1. Discover the tools with `tools/list`.
2. Ingest each inbound comment with matching vendor and id.
3. Read `list_queue` and preview each reply with `reply_to_comment`.
4. Approve the drafts a human approves.
5. Send approved drafts with `reply_to_comment` and dryRun false.
6. Read `get_cost_report` and state the cost.

## Rules

- Dry run before every live send. `reply_to_comment` previews by
  default; keep it that way until approval exists.
- Approve first. No live send without an approved draft or an
  explicit, user-supplied target.
- Never invent approvals. A draft you did not approve stays pending.
- Stop when a guard denies the call. State the reason.
- Never retry a denied call with changed text to dodge a guard.
- Report adapter errors as errors. Never present them as success.
- State the cost report before you claim the task is done.