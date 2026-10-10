// YouTube comment thread replies.

import { postJson, receiptFromJson, type VendorAdapterOptions } from "./base.js";

export interface YouTubeReplyConfig {
  token: string;
  parentId: string;
}

export class YouTubeReplyAdapter {
  readonly name = "youtube";

  constructor(
    private readonly config: YouTubeReplyConfig,
    private readonly options: VendorAdapterOptions = {},
  ) {}

  async dispatch(text: string): Promise<{ adapter: string; id: string; chars: number; at: string }> {
    const url = "https://www.googleapis.com/youtube/v3/comments?part=snippet";
    const { text: bodyText } = await postJson(url, {
      headers: {
        authorization: `Bearer ${this.config.token}`,
      },
      body: {
        snippet: {
          parentId: this.config.parentId,
          textOriginal: text,
        },
      },
      ...this.options,
    });
    return receiptFromJson(this.name, JSON.parse(bodyText), text);
  }
}