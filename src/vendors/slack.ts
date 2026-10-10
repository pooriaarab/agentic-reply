// Slack chat.postMessage replies.

import { VendorError } from "../core.js";
import { postJson, type VendorAdapterOptions } from "./base.js";

export interface SlackReplyConfig {
  token: string;
  channel: string;
  threadTs: string;
}

export class SlackReplyAdapter {
  readonly name = "slack";

  constructor(
    private readonly config: SlackReplyConfig,
    private readonly options: VendorAdapterOptions = {},
  ) {}

  async dispatch(text: string): Promise<{ adapter: string; id: string; chars: number; at: string }> {
    const { text: bodyText } = await postJson("https://slack.com/api/chat.postMessage", {
      headers: {
        authorization: `Bearer ${this.config.token}`,
      },
      body: {
        channel: this.config.channel,
        thread_ts: this.config.threadTs,
        text,
      },
      ...this.options,
    });
    const json = JSON.parse(bodyText) as { ok?: unknown; error?: unknown; ts?: unknown };
    // Slack reports failures as ok:false with a 200 status.
    if (json.ok !== true) {
      throw new VendorError(`slack chat.postMessage failed: ${String(json.error ?? "ok is false")}`);
    }
    if (typeof json.ts !== "string" || json.ts.length === 0) {
      throw new VendorError("slack chat.postMessage response carried no ts");
    }
    return {
      adapter: this.name,
      id: json.ts,
      chars: text.length,
      at: new Date().toISOString(),
    };
  }
}