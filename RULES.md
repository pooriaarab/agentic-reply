# agentic-reply rules

These rules bind every run of agentic-reply. They also bind agents
that drive this pack over MCP.

1. Preview before you act. Run each reply with dry run first, or
   depend on the dry-run default.
2. Approve first. A live reply needs an approved draft or an explicit
   user-supplied target. Known-ask rules auto-approve only their own
   matches.
3. Respect guards. A denied call stays denied.
4. Report failures as failures. Adapters throw, and callers surface
   the error. No silent success follows a failed call.
5. Count the cost. Read the cost report before you close a task.
6. Keep quiet hours. The pack refuses replies inside the window.

Pack: Answer inbound comments with human approval. Keywords: comments,
auto-reply, inbox, agentic-suite, claude-code, codex, cli, mcp.