// Mastodon status replies.

import { postJson, receiptFromJson, type VendorAdapterOptions } from "./base.js";

export interface MastodonReplyConfig {
  token: string;
  instance: string;
  inReplyToId: string;
}

export class MastodonReplyAdapter {
  readonly name = "mastodon";

  constructor(
    private readonly config: MastodonReplyConfig,
    private readonly options: VendorAdapterOptions = {},
  ) {}

  async dispatch(text: string): Promise<{ adapter: string; id: string; chars: number; at: string }> {
    const instance = this.config.instance.replace(/\/+$/, "");
    const url = `${instance}/api/v1/statuses`;
    const { text: bodyText } = await postJson(url, {
      headers: {
        authorization: `Bearer ${this.config.token}`,
      },
      body: {
        status: text,
        in_reply_to_id: this.config.inReplyToId,
      },
      ...this.options,
    });
    return receiptFromJson(this.name, JSON.parse(bodyText), text);
  }
}