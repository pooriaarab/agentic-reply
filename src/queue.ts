// Approval queue. Comments enter, drafts sit until a human approves or
// rejects them, and only approved drafts may be sent.

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import type { InboundComment, ReplyDraft } from "./comments.js";

export interface DraftStore {
  load(): ReplyDraft[];
  save(drafts: ReplyDraft[]): void;
}

// A JSON file on disk. One array of drafts per file, rewritten whole on
// every save. Small inboxes only, which is this pack's scale.

export function createJsonFileStore(path: string): DraftStore {
  return {
    load(): ReplyDraft[] {
      try {
        const raw = readFileSync(path, "utf8");
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          throw new Error(`draft store at ${path} holds no array`);
        }
        return parsed as ReplyDraft[];
      } catch (error) {
        if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT") {
          return [];
        }
        throw error;
      }
    },
    save(drafts: ReplyDraft[]): void {
      writeFileSync(path, JSON.stringify(drafts, null, 2), "utf8");
    },
  };
}

function memoryStore(): DraftStore {
  let drafts: ReplyDraft[] = [];
  return {
    load: () => drafts.map((draft) => ({ ...draft })),
    save: (next) => {
      drafts = next.map((draft) => ({ ...draft }));
    },
  };
}

export interface ApprovalQueue {
  ingest(comment: InboundComment, options?: { text?: string; auto?: boolean }): ReplyDraft;
  approve(id: string): ReplyDraft;
  reject(id: string): ReplyDraft;
  get(id: string): ReplyDraft | undefined;
  listPending(): ReplyDraft[];
}

export function createApprovalQueue(store?: DraftStore): ApprovalQueue {
  const backing = store ?? memoryStore();
  let drafts = backing.load();

  const persist = (): void => {
    backing.save(drafts);
  };

  const find = (id: string): ReplyDraft => {
    const draft = drafts.find((candidate) => candidate.id === id);
    if (draft === undefined) {
      throw new Error(`no draft with id "${id}"`);
    }
    return draft;
  };

  const setStatus = (id: string, status: "approved" | "rejected"): ReplyDraft => {
    const draft = find(id);
    if (draft.status !== "pending") {
      throw new Error(`draft "${id}" is ${draft.status}, only pending drafts change status`);
    }
    draft.status = status;
    persist();
    return { ...draft };
  };

  return {
    ingest(comment, options = {}) {
      const draft: ReplyDraft = {
        id: randomUUID(),
        comment: { ...comment },
        vendor: comment.vendor,
        target: {},
        text: options.text ?? comment.text,
        status: options.auto === true ? "approved" : "pending",
        auto: options.auto === true,
        createdAt: new Date().toISOString(),
      };
      drafts.push(draft);
      persist();
      return { ...draft };
    },
    approve(id) {
      return setStatus(id, "approved");
    },
    reject(id) {
      return setStatus(id, "rejected");
    },
    get(id) {
      const draft = find(id);
      return { ...draft };
    },
    listPending() {
      return drafts.filter((draft) => draft.status === "pending").map((draft) => ({ ...draft }));
    },
  };
}