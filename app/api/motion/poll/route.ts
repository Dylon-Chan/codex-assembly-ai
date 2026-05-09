import { pollMotionVideo } from "../../../../lib/ai/motion";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { operationId?: unknown };
    const operationId = typeof body.operationId === "string" ? body.operationId.trim() : "";

    if (!operationId) {
      return NextResponse.json({ error: "operationId is required." }, { status: 400 });
    }

    const result = await pollMotionVideo(operationId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Motion polling failed.", status: "error" },
      { status: 500 }
    );
  }
}
