// Generic webhook replies. The webhook carries no vendor fields, so any
// endpoint that accepts {reply, at} works.

import { createHmac, randomUUID } from "node:crypto";
import { VendorError } from "../core.js";
import { postJson, type VendorAdapterOptions } from "./base.js";

export interface WebhookReplyConfig {
  url: string;
  secret?: string;
}

export class WebhookReplyAdapter {
  readonly name = "webhook";

  constructor(
    private readonly config: WebhookReplyConfig,
    private readonly options: VendorAdapterOptions = {},
  ) {}

  async dispatch(text: string): Promise<{ adapter: string; id: string; chars: number; at: string }> {
    const body = JSON.stringify({ reply: text, at: new Date().toISOString() });
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.config.secret) {
      const signature = createHmac("sha256", this.config.secret)
        .update(body)
        .digest("hex");
      headers["x-reply-signature"] = signature;
    }
    let response: Response;
    try {
      response = await (this.options.fetchFn ?? fetch)(this.config.url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch (error) {
      throw new VendorError(`webhook request to ${this.config.url} failed: ${String(error)}`, {
        cause: error,
      });
    }
    const bodyText = await response.text();
    if (!response.ok) {
      throw new VendorError(
        `POST ${this.config.url} got status ${response.status}: ${bodyText.slice(0, 200)}`,
        { status: response.status },
      );
    }
    return {
      adapter: this.name,
      id: randomUUID(),
      chars: text.length,
      at: new Date().toISOString(),
    };
  }
}