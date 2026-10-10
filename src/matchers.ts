// Known-ask rules. A rule pairs a regex with a reply template. When the
// regex matches an inbound comment, the rule owns the reply and the
// draft is approved without a human in the loop.

import type { InboundComment } from "./comments.js";

export interface KnownAsk {
  name: string;
  // Regex source text. Compiled once per match, case-insensitive.
  pattern: string;
  // Reply template. {text} and {author} slots are filled per comment.
  reply: string;
}

export interface CompiledKnownAsk extends KnownAsk {
  regex: RegExp;
}

function compile(pattern: string): RegExp {
  try {
    return new RegExp(pattern, "i");
  } catch (error) {
    throw new Error(`invalid regex "${pattern}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function compileRules(rules: KnownAsk[]): CompiledKnownAsk[] {
  return rules.map((rule) => ({ ...rule, regex: compile(rule.pattern) }));
}

// First rule whose regex matches wins. Rules are checked in order.

export function matchKnownAsk(text: string, rules: KnownAsk[]): KnownAsk | undefined {
  const lowered = text;
  for (const rule of compileRules(rules)) {
    if (rule.regex.test(lowered)) {
      return { name: rule.name, pattern: rule.pattern, reply: rule.reply };
    }
  }
  return undefined;
}

// Fills {text} and {author} in a template. Any other braced slot is
// left untouched so a template can carry its own formatting.

export function fillReply(template: string, comment: InboundComment): string {
  return template
    .replaceAll("{text}", comment.text)
    .replaceAll("{author}", comment.author);
}