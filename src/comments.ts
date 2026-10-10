// Comment and draft models for the reply pipeline.

export interface InboundComment {
  id: string;
  vendor: string;
  author: string;
  text: string;
  url?: string;
  postedAt?: string;
}

export type DraftStatus = "pending" | "approved" | "rejected";

export interface ReplyDraft {
  id: string;
  comment: InboundComment;
  vendor: string;
  target: Record<string, string>;
  text: string;
  status: DraftStatus;
  auto: boolean;
  createdAt: string;
}

// Throws when a comment misses a required field. A comment with no text
// or no author cannot become a useful reply, so it never enters a queue.

export function validateComment(comment: InboundComment): void {
  if (typeof comment.id !== "string" || comment.id.trim().length === 0) {
    throw new Error("comment id must not be empty");
  }
  if (typeof comment.vendor !== "string" || comment.vendor.trim().length === 0) {
    throw new Error("comment vendor must not be empty");
  }
  if (typeof comment.author !== "string" || comment.author.trim().length === 0) {
    throw new Error("comment author must not be empty");
  }
  if (typeof comment.text !== "string" || comment.text.trim().length === 0) {
    throw new Error("comment text must not be empty");
  }
}