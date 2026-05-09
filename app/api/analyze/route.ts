import { analyzeManual } from "../../../lib/ai/analyze";
import type { ManualFile } from "../../../lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function isFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const manual = formData.get("manual");

    if (!isFile(manual)) {
      return NextResponse.json({ error: "Manual PDF file is required." }, { status: 400 });
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
