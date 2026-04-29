import Anthropic from "@anthropic-ai/sdk";
import {
  AiProviderError,
  type AiCompleteRequest,
  type AiCompleteResult,
  type AiMessage,
} from "./types";
import { buildUsage } from "./pricing";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

function splitMessages(messages: AiMessage[]): {
  system: string | undefined;
  rest: { role: "user" | "assistant"; content: string }[];
} {
  const sys = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  return { system: sys || undefined, rest };
}

export async function anthropicComplete(
  req: AiCompleteRequest,
  model: string,
): Promise<AiCompleteResult> {
  try {
    const { system, rest } = splitMessages(req.messages);
    const res = await client().messages.create({
      model,
      system,
      messages: rest.length ? rest : [{ role: "user", content: "" }],
      temperature: req.temperature ?? 0.3,
      max_tokens: req.maxTokens ?? 1500,
    });
    const text = res.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();
    return {
      text,
      provider: "anthropic",
      model,
      usage: buildUsage(model, res.usage.input_tokens, res.usage.output_tokens),
    };
  } catch (err) {
    throw new AiProviderError("anthropic", err);
  }
}
