import { GenerateVideosOperation, GoogleGenAI } from "@google/genai";
import { existsSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";
import type { GoogleAuthOptions } from "google-auth-library";
import type { AssemblyStep } from "../types";

export type MotionCreateResult =
  | { status: "unavailable"; error: string }
  | { status: "error"; error: string }
  | { status: "queued" | "in_progress" | "ready"; operationId?: string; videoUrl?: string; progress: number };

const DEFAULT_VEO_MODEL = "veo-3.1-fast-generate-001";
const MAX_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_MOTION_VIDEO_BYTES = 120 * 1024 * 1024;
const ALLOWED_REFERENCE_HOSTS = new Set(["oaidalleapiprodscus.blob.core.windows.net", "cdn.openai.com"]);
const GEMINI_MEDIA_HOST = "generativelanguage.googleapis.com";
const GCS_MEDIA_HOST = "storage.googleapis.com";
const GOOGLE_CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

type MotionRecord = Record<string, unknown>;
type GeminiMotionClient =
  | { mode: "apiKey"; ai: GoogleGenAI; apiKey: string }
  | { mode: "vertex"; ai: GoogleGenAI; auth: GoogleAuth };

let cachedMotionClient: GeminiMotionClient | null = null;
let cachedMotionClientKey: string | null = null;

function asRecord(value: unknown): MotionRecord {
  return typeof value === "object" && value !== null ? value as MotionRecord : {};
}

function geminiKey(): string | null {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
}

function googleAuthOptions(): GoogleAuthOptions {
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  return {
    scopes: [GOOGLE_CLOUD_SCOPE],
    ...(keyFilename && existsSync(keyFilename) ? { keyFilename } : {})
  };
}

function motionClient(): GeminiMotionClient | null {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (project) {
    const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
    const authOptions = googleAuthOptions();
    const cacheKey = JSON.stringify({ mode: "vertex", project, location, keyFilename: authOptions.keyFilename });
    if (cachedMotionClient?.mode === "vertex" && cachedMotionClientKey === cacheKey) {
      return cachedMotionClient;
    }

    const auth = new GoogleAuth(authOptions);
    const ai = new GoogleGenAI({
      vertexai: true,
      project,
      location,
      googleAuthOptions: authOptions
    });
    cachedMotionClient = { mode: "vertex", ai, auth };
    cachedMotionClientKey = cacheKey;
    return cachedMotionClient;
  }

  const apiKey = geminiKey();
  if (!apiKey) return null;
  const cacheKey = JSON.stringify({ mode: "apiKey", apiKey });
  if (cachedMotionClient?.mode === "apiKey" && cachedMotionClientKey === cacheKey) return cachedMotionClient;
  cachedMotionClient = { mode: "apiKey", ai: new GoogleGenAI({ apiKey }), apiKey };
  cachedMotionClientKey = cacheKey;
  return cachedMotionClient;
}

function missingAuthError(): string {
  return "GOOGLE_CLOUD_PROJECT plus GOOGLE_APPLICATION_CREDENTIALS, or GEMINI_API_KEY/GOOGLE_API_KEY, is required for Veo motion.";
}

function veoModel(): string {
  return process.env.VEO_MODEL || DEFAULT_VEO_MODEL;
}

export function buildMotionPrompt(projectName: string, step: AssemblyStep): string {
  const parts = step.parts.length
    ? step.parts.map((part) => `- ${part.id}: ${part.name} (qty ${part.quantity})`).join("\n")
    : "- None listed";
  const hardware = step.screws.length
    ? step.screws.map((item) => `- ${item.id}: ${item.name} (qty ${item.quantity})`).join("\n")
    : "- None listed";

  return [
    "ROLE",
    "Cinematic technical assembly animation. Animate only the mechanical action described. Start from the reference image and preserve all geometry, colors, labels, and part count exactly.",
    "",
    "SUBJECT",
    `Product: ${projectName}`,
    `Step: ${step.title}`,
    `Instruction: ${step.instruction}`,
    "",
    "COMPONENTS",
    "Parts:",
    parts,
    "",
    "Hardware:",
    hardware,
    "",
    "ANIMATION SEQUENCE",
    "1. Hold reference frame for 1 second to establish the starting state.",
    "2. Ghost the part(s) that will move with a translucent highlight indicating the subject.",
    "3. Animate the mechanical action smoothly along the correct axis as described in the instruction.",
    "4. Show cyan alignment guides as the part approaches its final position.",
    "5. Settle and lock into the final seated or fastened position with a subtle confirmation pulse.",
    "6. Hold the final state for 1 second.",
    "",
    "VISUAL STYLE",
    "- Smooth easing with no abrupt cuts or jumps",
    "- Translucent active parts during motion",
    "- Cyan alignment guides",
    "- Amber glowing trails on fasteners",
    "- Subtle technical grid overlay",
    "- Stable camera with gentle push-in parallax",
    "- Total duration: 8 seconds",
    "",
    "HARD CONSTRAINTS",
    "- Preserve all geometry, colors, labels, part count, and text from the reference image exactly",
    "- Animate only the parts described in the instruction; do not move unrelated parts",
    "- No human hands or people",
    "- No room scene or lifestyle context",
    "- No extra tools, parts, fasteners, or labels not in the components list",
    "- No invented mechanical actions",
    "- End on a clear, stable final state"
  ].join("\n");
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

function inlineVideoUrlFrom(sample: unknown): string | undefined {
  const record = asRecord(sample);
  const video = asRecord(record.video);
  const videoBytes = video.videoBytes ?? video.data ?? record.videoBytes;
  if (typeof videoBytes !== "string") return undefined;

  const mimeType = typeof video.mimeType === "string" ? video.mimeType : "video/mp4";
  return `data:${mimeType};base64,${videoBytes}`;
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
  const inlineVideoUrl = inlineVideoUrlFrom(samples[0]);
  if (inlineVideoUrl) {
    return { status: "ready", videoUrl: inlineVideoUrl, progress: 100 };
  }

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
  const client = motionClient();
  if (!client) return { status: "unavailable", error: missingAuthError() };
  if (!referenceImageUrl) {
    return { status: "error", error: "A generated reference image is required before motion creation." };
  }

  const { imageBytes, mimeType } = await referenceToInlineImage(referenceImageUrl);
  const operation = await client.ai.models.generateVideos({
    model: veoModel(),
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
  const client = motionClient();
  if (!client) return { status: "unavailable", error: missingAuthError() };

  const operationRequest = new GenerateVideosOperation();
  operationRequest.name = operationId;
  const operation = await client.ai.operations.getVideosOperation({ operation: operationRequest });
  return normalizeOperation(operation);
}

export async function proxyMotionContent(uri: string): Promise<Response> {
  const client = motionClient();
  if (!client) return new Response(missingAuthError(), { status: 500 });

  const parsed = new URL(uri);
  const trustedVideoHost = parsed.protocol === "https:"
    && parsed.hostname === GEMINI_MEDIA_HOST
    && /^\/v1(?:beta)?\/files\/[^/]+/.test(parsed.pathname);
  const trustedGcsUri = parsed.protocol === "gs:"
    && Boolean(parsed.hostname)
    && parsed.pathname.length > 1;
  if (!trustedVideoHost) {
    if (!trustedGcsUri) return new Response("Motion content URI is not trusted.", { status: 400 });
    if (client.mode !== "vertex") return new Response("GCS motion content requires Vertex AI auth.", { status: 400 });
  }

  const downloadUrl = trustedGcsUri ? gcsDownloadUrl(parsed) : parsed.toString();
  const headers = client.mode === "vertex"
    ? await client.auth.getRequestHeaders(downloadUrl)
    : { "x-goog-api-key": client.apiKey };
  const response = await fetch(downloadUrl, {
    headers,
    redirect: "follow"
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

function gcsDownloadUrl(parsed: URL): string {
  const bucket = encodeURIComponent(parsed.hostname);
  const objectPath = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `https://${GCS_MEDIA_HOST}/${bucket}/${objectPath}`;
}
