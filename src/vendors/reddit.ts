// Reddit comment replies via the OAuth API.

import { VendorError } from "../core.js";
import { postJson, type VendorAdapterOptions } from "./base.js";

export interface RedditReplyConfig {
  token: string;
  thingId: string;
  userAgent: string;
}

export class RedditReplyAdapter {
  readonly name = "reddit";

  constructor(
    private readonly config: RedditReplyConfig,
    private readonly options: VendorAdapterOptions = {},
  ) {}

  async dispatch(text: string): Promise<{ adapter: string; id: string; chars: number; at: string }> {
    const body = new URLSearchParams({
      thing_id: this.config.thingId,
      text,
      api_type: "json",
    }).toString();
    const { text: bodyText } = await postJson("https://oauth.reddit.com/api/comment", {
      headers: {
        authorization: `Bearer ${this.config.token}`,
        "user-agent": this.config.userAgent,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      ...this.options,
    });
    // Reddit reports errors inside the JSON errors array with a 200 status.
    let json: unknown;
    try {
      json = JSON.parse(bodyText);
    } catch {
      json = {};
    }
    const errors = (json as { errors?: unknown[] })?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      throw new VendorError(`reddit comment failed: ${JSON.stringify(errors)}`);
    }
    const jsonBody = (json as { json?: { data?: { things?: { data?: { id?: unknown } }[] } } })
      .json;
    const id = jsonBody?.data?.things?.[0]?.data?.id;
    if (typeof id !== "string" || id.length === 0) {
      throw new VendorError("reddit comment response carried no id");
    }
    return {
      adapter: this.name,
      id,
      chars: text.length,
      at: new Date().toISOString(),
    };
  }
}