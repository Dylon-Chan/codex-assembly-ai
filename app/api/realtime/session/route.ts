import { requireOpenAIKey } from "../../../../lib/ai/openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RealtimeSessionResponse = {
  id?: string;
  model?: string;
  client_secret?: unknown;
  value?: unknown;
  error?: unknown;
};

export async function POST() {
  try {
    const key = requireOpenAIKey();
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: process.env.REALTIME_MODEL || "gpt-realtime-2",
          audio: {
            output: {
              voice: "alloy"
            }
          },
          instructions: [
            "You are Aria, a personal assembly assistant built into AssembleAI.",
            "NEVER speak or call any tool until the user addresses you.",
            "Guide-grounded facts must come from the active guide context supplied by the client.",
            "General assembly know-how is allowed only when it does not contradict the guide.",
            "To answer anything about the current step, always call get_current_step first.",
            "Do not call mark_current_step_done unless the user clearly says the step is finished.",
            "Be patient, encouraging, concise, and safety-conscious."
          ].join(" ")
        }
      })
    });

    const raw = await response.json().catch(() => ({})) as RealtimeSessionResponse;
    if (!response.ok) {
      throw new Error(typeof raw.error === "string" ? raw.error : JSON.stringify(raw.error ?? raw));
    }

    return NextResponse.json({
      id: raw.id,
      model: raw.model,
      client_secret: raw.client_secret ?? raw.value
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Realtime session failed." },
      { status: 500 }
    );
  }
}
