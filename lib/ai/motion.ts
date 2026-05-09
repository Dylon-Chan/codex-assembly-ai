import { GoogleGenAI } from "@google/genai";
import type { AssemblyStep } from "../types";

export type MotionCreateResult =
  | { status: "unavailable"; error: string }
  | { status: "error"; error: string }
  | { status: "queued" | "in_progress" | "ready"; operationId?: string; videoUrl?: string; progress: number };

const VEO_MODEL = "veo-3.1-fast-generate-preview";
const MAX_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_MOTION_VIDEO_BYTES = 120 * 1024 * 1024;
const ALLOWED_REFERENCE_HOSTS = new Set(["oaidalleapiprodscus.blob.core.windows.net", "cdn.openai.com"]);
const GEMINI_MEDIA_HOST = "generativelanguage.googleapis.com";

type MotionRecord = Record<string, unknown>;

function asRecord(value: unknown): MotionRecord {
  return typeof value === "object" && value !== null ? value as MotionRecord : {};
}

function geminiKey(): string | null {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
}

export function buildMotionPrompt(projectName: string, step: AssemblyStep): string {
  const parts = step.parts.map((part) => `${part.id}: ${part.name} x${part.quantity}`).join(", ");
  const hardware = step.screws.map((item) => `${item.id}: ${item.name} x${item.quantity}`).join(", ");

  return [
    "Apple Vision Pro-style technical assembly animation.",
    `Product: ${projectName}.`,
    `Step: ${step.title}.`,
    `Instruction: ${step.instruction}.`,
    `Parts: ${parts || "No parts listed"}.`,
    `Hardware: ${hardware || "No hardware listed"}.`,
    "Start from the reference image and preserve geometry, colors, labels, and part count.",
    "Animate only the mechanical action in this exact step.",
    "Use smooth motion, translucent active parts, cyan alignment guides, glowing trails, and a subtle technical grid.",
    "Use a stable camera with a gentle parallax push-in.",
    "No hands, people, room scene, extra tools, extra parts, invented labels, or changed text.",
    "End on a clear final assembled state."
  ].join(" ");
}

export async function referenceToInlineImage(referenceImageUrl: string): Promise<{ imageBytes: string; mimeType: string }> {
  if (referenceImageUrl.startsWith("data:")) {
    const [header, data = ""] = referenceImageUrl.split(",", 2);
    const mimeType = header.match(/^data:([^;]+);base64$/)?.[1] || "image/png";
    if (!mimeType.startsWith("image/")) {
      throw new Error("Reference image data URL must be an image.");
    }
    if (Buffer.byteLength(data, "base64") > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error("Reference image must be 8 MB or smaller.");
    }
    return { imageBytes: data, mimeType };
  }

  const parsed = new URL(referenceImageUrl);
  if (parsed.protocol !== "https:" || !ALLOWED_REFERENCE_HOSTS.has(parsed.hostname)) {
    throw new Error("Reference image URL must be a trusted generated image URL.");
  }

  const response = await fetch(parsed.toString(), { redirect: "error" });
  if (!response.ok) {
    throw new Error("Reference image could not be loaded.");
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_REFERENCE_IMAGE_BYTES) {
    throw new Error("Reference image must be 8 MB or smaller.");
  }

  const mimeType = response.headers.get("content-type") || "image/png";
  if (!mimeType.startsWith("image/")) {
    throw new Error("Reference URL did not return an image.");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_REFERENCE_IMAGE_BYTES) {
    throw new Error("Reference image must be 8 MB or smaller.");
  }

  return {
    imageBytes: bytes.toString("base64"),
    mimeType
  };
}

function generatedVideosFrom(response: MotionRecord): unknown[] {
  if (Array.isArray(response.generatedVideos)) return response.generatedVideos;

  const generateVideoResponse = asRecord(response.generateVideoResponse);
  if (Array.isArray(generateVideoResponse.generatedSamples)) return generateVideoResponse.generatedSamples;

  return [];
}

function videoUriFrom(sample: unknown): string | undefined {
  const record = asRecord(sample);
  const video = asRecord(record.video);
  const uri = video.uri ?? record.uri;
  return typeof uri === "string" ? uri : undefined;
}

function progressFrom(metadata: unknown): number {
  const record = asRecord(metadata);
  const progress = record.progressPercent ?? record.progress ?? record.percentComplete;
  const value = typeof progress === "number" ? progress : Number.parseFloat(String(progress));
  if (!Number.isFinite(value)) return 45;
  return Math.max(1, Math.min(99, Math.round(value)));
}

function normalizeOperation(raw: unknown): MotionCreateResult {
  const operation = asRecord(raw);
  const response = asRecord(operation.response ?? raw);
  const samples = generatedVideosFrom(response);
  const uri = videoUriFrom(samples[0]);

  if (uri) {
    return { status: "ready", videoUrl: `/api/motion/content?uri=${encodeURIComponent(uri)}`, progress: 100 };
  }

  if (operation.error) {
    return { status: "error", error: JSON.stringify(operation.error) };
  }

  return {
    status: operation.done ? "queued" : "in_progress",
    operationId: typeof operation.name === "string" ? operation.name : undefined,
    progress: progressFrom(operation.metadata)
  };
}

export async function createMotionVideo(
  projectName: string,
  step: AssemblyStep,
  referenceImageUrl?: string
): Promise<MotionCreateResult> {
  const key = geminiKey();
  if (!key) return { status: "unavailable", error: "GEMINI_API_KEY or GOOGLE_API_KEY is required for Veo motion." };
  if (!referenceImageUrl) {
    return { status: "error", error: "A generated reference image is required before motion creation." };
  }

  const { imageBytes, mimeType } = await referenceToInlineImage(referenceImageUrl);
  const ai = new GoogleGenAI({ apiKey: key });
  const operation = await ai.models.generateVideos({
    model: VEO_MODEL,
    prompt: buildMotionPrompt(projectName, step),
    image: { imageBytes, mimeType },
    config: {
      numberOfVideos: 1,
      aspectRatio: "16:9",
      durationSeconds: 8,
      resolution: "720p",
      personGeneration: "allow_adult"
    }
  });

  return normalizeOperation(operation);
}

export async function pollMotionVideo(operationId: string): Promise<MotionCreateResult> {
  const key = geminiKey();
  if (!key) return { status: "unavailable", error: "GEMINI_API_KEY or GOOGLE_API_KEY is required for Veo motion." };

  const ai = new GoogleGenAI({ apiKey: key });
  const operation = await ai.operations.getVideosOperation({ operation: { name: operationId } as never });
  return normalizeOperation(operation);
}

export async function proxyMotionContent(uri: string): Promise<Response> {
  const key = geminiKey();
  if (!key) return new Response("GEMINI_API_KEY or GOOGLE_API_KEY is required for Veo motion.", { status: 500 });

  const parsed = new URL(uri);
  const trustedVideoHost = parsed.protocol === "https:"
    && parsed.hostname === GEMINI_MEDIA_HOST
    && /^\/v1(?:beta)?\/files\/[^/]+/.test(parsed.pathname);
  if (!trustedVideoHost) {
    return new Response("Motion content URI is not trusted.", { status: 400 });
  }

  const response = await fetch(parsed.toString(), {
    headers: { "x-goog-api-key": key },
    redirect: "error"
  });
  if (!response.ok) {
    return new Response("Motion content could not be loaded.", { status: response.status });
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("video/")) {
    return new Response("Motion content URI did not return video.", { status: 502 });
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_MOTION_VIDEO_BYTES) {
    return new Response("Motion video is too large.", { status: 502 });
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_MOTION_VIDEO_BYTES) {
    return new Response("Motion video is too large.", { status: 502 });
  }

  return new Response(bytes, {
    status: response.status,
    headers: {
      "content-type": contentType,
      "cache-control": "private, max-age=300"
    }
  });
}
