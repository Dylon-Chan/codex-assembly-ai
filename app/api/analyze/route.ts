import { analyzeManual } from "../../../lib/ai/analyze";
import type { ManualFile } from "../../../lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_MANUAL_BYTES = 50 * 1024 * 1024;

function isFile(value: unknown): value is File {
  return value instanceof File;
}

function isPdfManual(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const manual = formData.get("manual");

    if (!isFile(manual)) {
      return NextResponse.json({ error: "Manual PDF file is required." }, { status: 400 });
    }

    if (!isPdfManual(manual)) {
      return NextResponse.json({ error: "Manual upload must be a PDF file." }, { status: 400 });
    }

    if (manual.size > MAX_MANUAL_BYTES) {
      return NextResponse.json({ error: "Manual PDF must be 50 MB or smaller." }, { status: 413 });
    }

    const arrayBuffer = await manual.arrayBuffer();
    const manualFile: ManualFile = {
      filename: manual.name || "manual.pdf",
      mimeType: manual.type || "application/pdf",
      base64Data: Buffer.from(arrayBuffer).toString("base64")
    };

    const partPhotos = formData
      .getAll("partPhotos")
      .filter(isFile)
      .map((file) => file.name)
      .filter(Boolean);

    const analysis = await analyzeManual(manualFile, partPhotos);
    return NextResponse.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to analyze manual.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
