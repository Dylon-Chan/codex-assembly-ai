import { requireOpenAIKey } from "../../../../lib/ai/openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RealtimeSessionResponse = {
  id?: string;
  model?: string;
  client_secret?: unknown;
  error?: unknown;
};

export async function POST() {
  try {
    const key = requireOpenAIKey();
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.REALTIME_MODEL || "gpt-realtime-2",
        voice: "alloy",
        instructions: [
          "You are AssembleAI, a concise hands-free assembly guide.",
          "Help the user move step by step through the current manual.",
          "Use practical short instructions and ask for a progress check when alignment, fastening, or safety matters.",
          "Never invent parts, hardware, tools, holes, or steps not present in the provided guide."
        ].join(" ")
      })
    });

    const raw = await response.json().catch(() => ({})) as RealtimeSessionResponse;
    if (!response.ok) {
      throw new Error(typeof raw.error === "string" ? raw.error : JSON.stringify(raw.error ?? raw));
    }

    return NextResponse.json({
      id: raw.id,
      model: raw.model,
      client_secret: raw.client_secret
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Realtime session failed." },
      { status: 500 }
    );
  }
}
