import { verifyProgressPhoto } from "../../../lib/ai/verify";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function isFile(value: unknown): value is File {
  return value instanceof File;
}

function isImageFile(file: File): boolean {
  return IMAGE_TYPES.has(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

async function fileToDataUrl(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  return `data:${file.type || "image/jpeg"};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const stepTitle = String(formData.get("stepTitle") || "").trim();
    const photo = formData.get("photo");
    const frame = formData.get("frame");
    const image = isFile(photo) ? photo : isFile(frame) ? frame : null;

    if (!stepTitle) {
      return NextResponse.json({ error: "stepTitle is required." }, { status: 400 });
    }

    if (image) {
      if (!isImageFile(image)) {
        return NextResponse.json({ error: "Progress image must be JPEG, PNG, WebP, HEIC, or HEIF." }, { status: 400 });
      }
      if (image.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "Progress image must be 12 MB or smaller." }, { status: 413 });
      }
    }

    const result = await verifyProgressPhoto(stepTitle, image ? await fileToDataUrl(image) : undefined);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Progress verification failed." },
      { status: 500 }
    );
  }
}
