import { createMotionVideo } from "../../../../lib/ai/motion";
import type { AssemblyStep } from "../../../../lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function isStep(value: unknown): value is AssemblyStep {
  return typeof value === "object" && value !== null && typeof (value as { title?: unknown }).title === "string";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as {
      projectName?: unknown;
      step?: unknown;
      referenceImageUrl?: unknown;
      imageUrl?: unknown;
    };
    const projectName = typeof body.projectName === "string" ? body.projectName.trim() : "";
    const referenceImageUrl = typeof body.referenceImageUrl === "string"
      ? body.referenceImageUrl
      : typeof body.imageUrl === "string"
        ? body.imageUrl
        : undefined;

    if (!projectName || !isStep(body.step)) {
      return NextResponse.json({ error: "projectName and step are required." }, { status: 400 });
    }

    const result = await createMotionVideo(projectName, body.step, referenceImageUrl);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Motion creation failed.", status: "error" },
      { status: 500 }
    );
  }
}
