import { proxyMotionContent } from "../../../../lib/ai/motion";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const uri = new URL(request.url).searchParams.get("uri");
    if (!uri) {
      return NextResponse.json({ error: "uri is required." }, { status: 400 });
    }

    return proxyMotionContent(uri);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Motion content proxy failed." },
      { status: 500 }
    );
  }
}
