export const RESPONSES_URL = "https://api.openai.com/v1/responses";
export const IMAGES_URL = "https://api.openai.com/v1/images/generations";

type FetchOptions = {
  body: unknown;
  apiKey?: string;
};

export function requireOpenAIKey(apiKey = process.env.OPENAI_API_KEY): string {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for this AI route.");
  }
  return apiKey;
}

export async function callResponses({ body, apiKey }: FetchOptions): Promise<unknown> {
  const key = requireOpenAIKey(apiKey);
  const response = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof raw === "object" && raw && "error" in raw
      ? JSON.stringify(raw.error)
      : `OpenAI request failed with ${response.status}`;
    throw new Error(message);
  }
  return raw;
}

export function extractResponseText(rawInput: unknown): string {
  if (typeof rawInput !== "object" || rawInput === null) return "";
  const raw = rawInput as Record<string, unknown>;
  if (typeof raw.output_text === "string") return raw.output_text;

  const output = Array.isArray(raw.output) ? raw.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (typeof item !== "object" || item === null) continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const part of content) {
      if (typeof part !== "object" || part === null) continue;
      const partRecord = part as Record<string, unknown>;
      if (partRecord.type === "output_text" && typeof partRecord.text === "string") {
        chunks.push(partRecord.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

export function parseJsonOutput<T>(raw: unknown, fallback?: T): T {
  const text = extractResponseText(raw).trim();
  if (!text) {
    if (fallback !== undefined) return fallback;
    throw new Error("AI response did not include output text.");
  }

  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw new Error(`AI response was not valid JSON: ${(error as Error).message}`);
  }
}
