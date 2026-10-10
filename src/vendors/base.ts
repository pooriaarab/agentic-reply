// Vendor plumbing. One adapter per vendor delivers a reply text to its
// real endpoint. All adapters share the base helpers here.

import { VendorError, type RouterAdapter } from "../core.js";

// A record of vendor target fields, for example {owner, repo, issueNumber}.
export type ReplyTarget = Record<string, string>;

export interface PostJsonOptions {
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export interface PostJsonResult {
  response: Response;
  text: string;
}

// POSTs JSON to a URL. Throws VendorError on network failure and on any
// non-2xx status; the message carries the status and the first 200 chars
// of the body so failures are diagnosable without a second request.

export async function postJson(url: string, options: PostJsonOptions = {}): Promise<PostJsonResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...options.headers,
      },
      body:
        options.body === undefined
          ? undefined
          : typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new VendorError(`request to ${url} failed: ${String(error)}`, { cause: error });
  }
  const text = await response.text();
  if (!response.ok) {
    const snippet = text.slice(0, 200);
    throw new VendorError(`POST ${url} got status ${response.status}: ${snippet}`, {
      status: response.status,
    });
  }
  return { response, text };
}

export interface VendorAdapterOptions {
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

// Builds a receipt from the JSON body. Fails loudly when the id is
// missing so a silent success never reaches the caller.

export function receiptFromJson(
  adapter: string,
  payload: unknown,
  text: string,
): { adapter: string; id: string; chars: number; at: string } {
  const json = payload as { id?: unknown };
  const rawId = json?.id;
  if (typeof rawId !== "string" && typeof rawId !== "number") {
    throw new VendorError(`${adapter} response carried no id`);
  }
  if (typeof rawId === "string" && rawId.length === 0) {
    throw new VendorError(`${adapter} response carried no id`);
  }
  return {
    adapter,
    id: String(rawId),
    chars: text.length,
    at: new Date().toISOString(),
  };
}

export type { RouterAdapter };