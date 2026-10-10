---
name: agentic-reply
description: Answer inbound comments with human approval. Keywords: comments, auto-reply, inbox, agentic-suite, claude-code, codex, cli, mcp.
---

# agentic-reply

Answer inbound comments with human approval.

## Use the SDK

```js
import { createApprovalQueue, previewReply, sendReply } from "agentic-reply";

const queue = createApprovalQueue();
const draft = queue.ingest({ id: "c1", vendor: "github", author: "bob", text: "hi" });
previewReply(draft); // dry run, no delivery
queue.approve(draft.id);
await sendReply(draft, { adapter });
```

## Use the CLI

```sh
agentic-reply ingest --vendor github --id c1 --author bob --text "hi"
agentic-reply queue
agentic-reply approve --id <draft-id>
agentic-reply reply --vendor github --target '{"owner":"o","repo":"r","issueNumber":"1"}' --text "hi"
```

## Use the MCP server

Start the server with `agentic-reply mcp`. Call `ingest_comment` to
queue, `list_queue` and `approve_reply` to manage drafts,
`reply_to_comment` to preview or send (dryRun defaults to true),
`summarize_text` for stats, and `get_cost_report` for costs.

## Rules

- Dry run before each live send.
- Approve every draft before it sends, except known-ask matches.
- Report guard denials and adapter errors as failures.
- Read the cost report at the end.