import { GoogleGenAI } from "@google/genai";
import type { AssemblyStep } from "../types";

export type MotionCreateResult =
  | { status: "unavailable"; error: string }
  | { status: "error"; error: string }
  | { status: "queued" | "in_progress" | "ready"; operationId?: string; videoUrl?: string; progress: number };

const VEO_MODEL = "veo-3.1-fast-generate-preview";

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
    return { imageBytes: data, mimeType };
  }

  const response = await fetch(referenceImageUrl);
  if (!response.ok) {
    throw new Error("Reference image could not be loaded.");
  }

  return {
    imageBytes: Buffer.from(await response.arrayBuffer()).toString("base64"),
    mimeType: response.headers.get("content-type") || "image/png"
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

  const response = await fetch(uri, { headers: { "x-goog-api-key": key } });
  if (!response.ok) {
    return new Response("Motion content could not be loaded.", { status: response.status });
  }

  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "video/mp4",
      "cache-control": "private, max-age=300"
    }
  });
}
