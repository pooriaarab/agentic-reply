// GitHub issue comment replies.

import { postJson, receiptFromJson, type VendorAdapterOptions } from "./base.js";

export interface GitHubReplyConfig {
  token: string;
  owner: string;
  repo: string;
  issueNumber: string | number;
}

export class GitHubReplyAdapter {
  readonly name = "github";

  constructor(
    private readonly config: GitHubReplyConfig,
    private readonly options: VendorAdapterOptions = {},
  ) {}

  async dispatch(text: string): Promise<{ adapter: string; id: string; chars: number; at: string }> {
    const { owner, repo, issueNumber } = this.config;
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
    const { text: bodyText } = await postJson(url, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${this.config.token}`,
      },
      body: { body: text },
      ...this.options,
    });
    return receiptFromJson(this.name, JSON.parse(bodyText), text);
  }
}