import OpenAI from "openai";
import {
  AiProviderError,
  type AiCompleteRequest,
  type AiCompleteResult,
} from "../types";
import { buildUsage } from "../pricing";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  _client = new OpenAI({ apiKey: key });
  return _client;
}

export async function openaiComplete(
  req: AiCompleteRequest,
  model: string,
): Promise<AiCompleteResult> {
  try {
    const res = await client().chat.completions.create({
      model,
      messages: req.messages.map(
        (m: AiCompleteRequest["messages"][number]) => ({
          role: m.role,
          content: m.content,
        }),
      ),
      temperature: req.temperature ?? 0.3,
      max_tokens: req.maxTokens ?? 1500,
      response_format: req.jsonMode ? { type: "json_object" } : undefined,
    });
    const text = res.choices[0]?.message?.content ?? "";
    const u = res.usage;
    return {
      text,
      provider: "openai",
      model,
      usage: buildUsage(
        model,
        u?.prompt_tokens ?? 0,
        u?.completion_tokens ?? 0,
      ),
    };
  } catch (err) {
    throw new AiProviderError("openai", err);
  }
}
