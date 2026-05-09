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

function imageMimeType(file: File): string {
  if (IMAGE_TYPES.has(file.type)) return file.type;
  if (/\.jpe?g$/i.test(file.name)) return "image/jpeg";
  if (/\.png$/i.test(file.name)) return "image/png";
  if (/\.webp$/i.test(file.name)) return "image/webp";
  if (/\.heic$/i.test(file.name)) return "image/heic";
  if (/\.heif$/i.test(file.name)) return "image/heif";
  return "image/jpeg";
}

async function fileToDataUrl(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  return `data:${imageMimeType(file)};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
}

function parseStringArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || "[]")) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseStepItems(value: unknown): Array<{ id: string; name: string; quantity: number }> {
  try {
    const parsed = JSON.parse(String(value || "[]")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const record = item as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : "";
      const name = typeof record.name === "string" ? record.name : "";
      const quantity = typeof record.quantity === "number" && Number.isFinite(record.quantity) ? record.quantity : 1;
      return id && name ? [{ id, name, quantity }] : [];
    });
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const stepTitle = String(formData.get("stepTitle") || "").trim();
    const instruction = String(formData.get("instruction") || "").trim();
    const simpleCheck = String(formData.get("simpleCheck") || "").trim();
    const cautions = parseStringArray(formData.get("cautions"));
    const parts = parseStepItems(formData.get("parts"));
    const screws = parseStepItems(formData.get("screws"));
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

    const result = await verifyProgressPhoto(
      { stepTitle, instruction, simpleCheck, cautions, parts, screws },
      image ? await fileToDataUrl(image) : undefined
    );
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Progress verification failed." },
      { status: 500 }
    );
  }
}
