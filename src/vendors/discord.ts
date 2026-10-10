// Discord message replies in a channel thread.

import { postJson, receiptFromJson, type VendorAdapterOptions } from "./base.js";

export interface DiscordReplyConfig {
  token: string;
  channelId: string;
  messageId: string;
}

export class DiscordReplyAdapter {
  readonly name = "discord";

  constructor(
    private readonly config: DiscordReplyConfig,
    private readonly options: VendorAdapterOptions = {},
  ) {}

  async dispatch(text: string): Promise<{ adapter: string; id: string; chars: number; at: string }> {
    const url = `https://discord.com/api/v10/channels/${this.config.channelId}/messages`;
    const { text: bodyText } = await postJson(url, {
      headers: {
        authorization: `Bot ${this.config.token}`,
      },
      body: {
        content: text,
        message_reference: { message_id: this.config.messageId },
      },
      ...this.options,
    });
    return receiptFromJson(this.name, JSON.parse(bodyText), text);
  }
}